'use strict'
/**
 * GET Badges
 * Controllers for badge routes
 * (C) Habib Rehman
 ******************************/

// Deps
const req = require('request-promise-native'),
  logger = require('winston'),
  numeral = require('numeral'),
  parseLink = require('parse-link-header'),
  _ = require('lodash'),
  querystring = require('querystring')
const {inspect} = require('util')

// GitHub API Constants
const GH_API_BASE_URI = 'https://api.github.com/repos/%s/%s/releases',
  GH_API_STATUS_URI = 'https://api.github.com/rate_limit',
  GH_API_OAUTH_TOKEN = process.env.GH_API_OAUTH_TOKEN || '',
  GH_API_PAGE_SIZE = 100,
  GH_API_TAGS_RPATH = 'tags',
  GH_API_DEFAULT_RPATH = 'latest'

// Params
const SHIELDS_URI_PARAM = 'badge',
  ALLOWED_PARAMS = [SHIELDS_URI_PARAM]

// Defaults
const DEFAULT_SHIELDS_URI = 'https://img.shields.io/badge/downloads-%s-green.svg',
  DEFAULT_PLACEHOLDER = 'X',
  DEFAULT_REQ_UA = 'Badge Getter',
  DEFAULT_MIME_TYPE = 'image/svg+xml',
  DEFAULT_DB_UPDATE_OPTS = {
    returnOriginal: false
}

// HTTP stuff
const HTTP_NOT_MODIFIED_CODE = 304,
  HTTP_FORBIDDEN_CODE = 403,
  HTTP_OK_CODE = 200,
  HTTP_PARTIAL_CONTENT_CODE = 206,
  HTTP_OK_REGEX = /^2/

const SUB_REGEX = /%s/g

// String template substition
function sub (str, ...subs) {
  let n = 0
  return str.replace(SUB_REGEX, () => {
    return subs[n++]
  })
}


/**
 * Debug/Logging utils
 */

function inspectObj (obj) {
  return inspect(obj, { depth: null, colors: true })
}

// Custom log for debugging
function debug (obj, ...args) {
  logger.log('debug', ...args, inspectObj(obj))
}

// Log the outcome of a db operation
function logOutcome (val, equal, op, url) {
  if (_.isEqual(val, equal)) {
    logger.info(`${url} ${op} successful`)
  } else {
    logger.error(`${url} ${op} unsuccessfull`)
  }
}


/**
 * Mongodb Document builders
 */

function downloadDoc (path, ghURI, ghId, ghTag, ...fields) {
  let doc = {
    ghETAG: fields[0],
    ghLastMod: fields[1],
    count: fields[2],
    lastUpdated: fields[3],
    requests: fields[4]
  }
  if (path) doc.path = path
  if (ghURI) doc.ghURI = ghURI
  if (ghId) doc.ghId = ghId
  if (ghTag) doc.ghTag = ghTag
  return doc
}

function totalDownloadDoc (path, ghURI, ...fields) {
  let doc = {
    pages: fields[0],
    lastPage: fields[1],
    count: fields[2],
    lastUpdated: fields[3],
    requests: fields[4]
  }
  if (path) doc.path = path
  if (ghURI) doc.ghURI = ghURI
  return doc
}

function pageDoc (...fields) {
  return {
    page: fields[0],
    ghETAG: fields[1],
    ghURI: fields[2],
    lastUpdated: fields[3],
    count: fields[4]
  }
}


/**
 * Request builders
 */

// Builds request options for GET badge calls
function buildBadgeOpts (URI) {
  return {
    uri: URI,
    headers: {
      'User-Agent': DEFAULT_REQ_UA
    },
    resolveWithFullResponse: true,
    json: true
  }
}

// Builds request options for GH API calls
function buildGhApiOpts (URI, ifReqVal) {
  let ghApiOpts = {
    uri: URI,
    headers: {
      // Required for GitHub API
      'User-Agent': DEFAULT_REQ_UA,
      'Accept': 'application/vnd.github.v3.full+json',
      'Authorization': `token ${GH_API_OAUTH_TOKEN}`
    },
    resolveWithFullResponse: true,
    json: true
  }
  if (ifReqVal) {
    // Merge opts
    return _.merge(ghApiOpts, {
      simple: false, // to handle response filteration
      headers: {
        // For conditional request
        'If-None-Match': ifReqVal
      }
    })
  }
  return ghApiOpts
}

// Builds the GitHub API Request URI
function buildGhURI (owner, repo, ...paths) {
  const apiReqBase = sub(GH_API_BASE_URI, owner, repo)
  if (_.isEmpty(paths)) return apiReqBase
  return `${apiReqBase}/${paths.join('/')}`
}

// Build querystring (for pagination)
function buildPageQsURI (uri, page) {
  let qs = {
    per_page: GH_API_PAGE_SIZE
  }
  if (page) qs.page = page
  return `${uri}?${querystring.stringify(qs)}`
}

// Checks if request url is valid
function isReqValid (reqUrlQuery) {
  // Check if only allowed params passed
  return _.isEmpty(_.omit(reqUrlQuery, ALLOWED_PARAMS))
}


/**
 * Requesters
 */

// Gets the badge from the passed shields URI
function getBadge (shieldsReqURI) {
  return req(buildBadgeOpts(shieldsReqURI))
    .then((res) => {
      return {type: res.headers['content-type'], body: res.body}
    })
}

// Calculates the total download count for a single release
function getReleaseDownloadCount (release) {
  return release.assets.reduce((acc, r) => {
    return acc + r.download_count
  }, 0)
}

// Gets the total download count
function getDownloadCount (pageBody) {
  if (_.isArray(pageBody)) {
    // Calculate download count for all releases
    let totalCountArr = pageBody.map((release) => getReleaseDownloadCount(release))
    return _.sum(totalCountArr)
  } else {
    // Calculate download count for a single release
    return getReleaseDownloadCount(pageBody)
  }
}

// Gets the release data with count
function getReleaseData (url, extraOpts) {
  return req(buildGhApiOpts(url, extraOpts))
    .then((res) => {
      res.count = getDownloadCount(res.body)
      return res
    })
}


/**
 * Get a page
 * Handle GET page (pagination) response to yield a page doc
 */
function getPage (pageNo, fetchedPage, cachedPage) {
  switch (true) {
    case fetchedPage.statusCode === HTTP_NOT_MODIFIED_CODE:
      // Has not been modified
      logger.info(`Page ${pageNo} has NOT changed. Serving from cache...`)
      // Serve from cache
      return cachedPage

    case fetchedPage.statusCode === HTTP_FORBIDDEN_CODE:
    // GitHub API Limit reached

      // Throw error if uncached page
      if (!cachedPage) throw new Error(`${fetchedPage.statusCode}: GH API Limit reached`)
      // Serve from cache
      return cachedPage

    case HTTP_OK_REGEX.test(fetchedPage.statusCode.toString()):
      // Has been modified or is new
      logger.info(`Page ${pageNo} HAS changed. Updating cache & serving...`)

      // Create page
      let downloadCount = getDownloadCount(fetchedPage.body)
      debug(fetchedPage.request.href, 'Fetched ')
      // Serve from freshly fetched data
      return pageDoc(pageNo, fetchedPage.headers.etag, fetchedPage.request.href, fetchedPage.headers.date, downloadCount)

    default:
      let unknownError = new Error(`Got bad response ${fetchedPage.headers.status},
        full response`, '\n', inspectObj(fetchedPage))
      // Unknown error occurred
      logger.error(unknownError)
      // Throw error if uncached page
      if (!cachedPage) throw unknownError
      // Still serve from cache
      return cachedPage
  }
}


/**
 * Get the badge data of total (#downloads)
 * From the GitHub API
 */
async function getTotalDownloadData (ghURI, cachedData) {
  const firstPageURI = buildPageQsURI(ghURI)
  const firstPageNo = 1
  const firstCachedPage = _.hasIn(cachedData, `pages[${firstPageNo}]`) ? cachedData.pages[firstPageNo] : null
  const firstPageETAG = cachedData ? firstCachedPage.ghETAG : null
  const firstPage = await req(buildGhApiOpts(firstPageURI, firstPageETAG))
  const lastUpdated = firstPage.headers.date
  let pages = {} // page map
  let count = 0 // total download count
  let lastPage = 1 // last page is the first by default

  pages[firstPageNo] = getPage(firstPageNo, firstPage, firstCachedPage)

  debug(firstPageURI, 'firstPageURI:')

  if (_.has(firstPage, 'headers.link')) {
    // Response is paginated
    logger.info(`Response IS paginated`)
    let linkHeader = parseLink(firstPage.headers.link)
    lastPage = parseInt(linkHeader.last.page)

    // Traverse pages (fetch all in parallel) excl. first page
    const getPagePromises = _.rangeRight(lastPage, firstPageNo).map(async pageNo => {
      let pageURI = buildPageQsURI(ghURI, pageNo)
      // Only use etag when cachedData passed
      // If page exists use it otherwise create a new one
      let cachedPage = _.hasIn(cachedData, `pages[${pageNo}]`) ? cachedData.pages[pageNo] : null
      let fetchPageETAG = cachedPage ? cachedPage.ghETAG : null
      let fetchedPage = await req(buildGhApiOpts(pageURI, fetchPageETAG))
      pages[pageNo] = getPage(pageNo, fetchedPage, cachedPage)
      return 1
    })

    // Fetch the pages in sequence
    for (const getPagePromise of getPagePromises) {
      await getPagePromise
    }

    debug(pages, 'Pages is:\n')
  } else {
    // Response is not paginated
    logger.info(`Response is NOT paginated`)
  }

  // Sum the download count for each page to calc total
  for (let page in pages) {
    count += pages[page].count
  }

  debug(count, 'Total download count:')

  return {count, pages, lastPage, lastUpdated}
}


async function getBadgeTotalData (ghURI, downloads, findFilter, path) {
  // finds by the request path by default
  findFilter = findFilter || {path}
  // Query cache for existence
  const cachedTotalDownloadData = await downloads.findOne(findFilter)

  debug(cachedTotalDownloadData, 'Cached data:', '\n')
  debug(path, 'Normalized Request path:')

  // Check if in cache
  if (_.isEmpty(cachedTotalDownloadData)) {
    // Not in cache so fetch
    logger.info(`${path} NOT IN cache. Fetching...`)

    // Get the latest total download data
    const totalDownloadData = await getTotalDownloadData(ghURI)

    // Update cache
    const outcome = await downloads.insertOne(totalDownloadDoc(
      path,
      ghURI,
      totalDownloadData.pages,
      totalDownloadData.lastPage,
      totalDownloadData.count,
      totalDownloadData.lastUpdated,
      1
    ))

    logOutcome(outcome.insertedCount, 1, 'insert', path)

    return totalDownloadData.count
  } else {
    // In cache
    logger.info(`${path} IN cache. Checking if changed`)

    // Get the latest total download data
    const totalDownloadData = await getTotalDownloadData(ghURI, cachedTotalDownloadData)

    if (totalDownloadData.count !== cachedTotalDownloadData.count) {
      // Data has changed so update cache
      const updatedDoc = totalDownloadDoc(
        null,
        null,
        totalDownloadData.pages,
        totalDownloadData.lastPage,
        totalDownloadData.count,
        totalDownloadData.lastUpdated,
        ++cachedTotalDownloadData.requests
      )

      // Update cache
      const outcome = await downloads.updateOne(findFilter, {$set: updatedDoc}, DEFAULT_DB_UPDATE_OPTS)
      logOutcome(outcome.modifiedCount, 1, 'update totalDownload', path)

      // Serve from freshly fetched data
      return totalDownloadData.count
    } else {
      return cachedTotalDownloadData.count
    }
  }
}


/**
 * Get the badge data (#downloads)
 * From cache or via GitHub API
 */
async function getBadgeData (ghURI, downloads, findFilter, path) {
  // finds by the request path by default
  findFilter = findFilter || {path}
  // Query cache for existence
  const cachedReleaseData = await downloads.findOne(findFilter)

  debug(cachedReleaseData, 'Cached data:', '\n')
  debug(path, 'Normalized Request path:')

  // Check if in cache
  if (_.isEmpty(cachedReleaseData)) {
    // Not in cache so fetch
    logger.info(`${path} NOT IN cache. Fetching...`)

    // Get downloads for a release

    // Fetch release data
    var releaseData = await getReleaseData(ghURI)

    // Update cache
    var outcome = await downloads.insertOne(downloadDoc(
      path,
      ghURI,
      releaseData.body.id,
      releaseData.body.tag_name,
      releaseData.headers.etag,
      releaseData.headers['last-modified'],
      releaseData.count,
      releaseData.headers.date,
      1
    ))

    logOutcome(outcome.insertedCount, 1, 'insert', path)

    return releaseData.count
  } else {
    // In cache
    logger.info(`${path} IN cache. Checking if changed`)

    // Fetch release data
    let releaseData = await req(buildGhApiOpts(ghURI, cachedReleaseData.ghETAG))
    const statusCode = releaseData.statusCode

    debug(releaseData.headers.status, `Got response`)
    // Check if outdated
    switch (true) {
      case statusCode === HTTP_NOT_MODIFIED_CODE:
        // Has not been modified
        logger.info(`${path} has NOT changed. Serving from cache...`)
        // Update cache requests
        var outcome = await downloads.updateOne(findFilter, {$inc: {requests: 1}}, DEFAULT_DB_UPDATE_OPTS)
        logOutcome(outcome.modifiedCount, 1, 'update requests', path)
        // Serve from cache
        return cachedReleaseData.count

      case statusCode === HTTP_FORBIDDEN_CODE:
        // GitHub API Limit reached
        var outcome = await downloads.updateOne(findFilter, {$inc: {requests: 1}}, DEFAULT_DB_UPDATE_OPTS)
        logOutcome(outcome.modifiedCount, 1, 'update requests', path)
        // Serve from cache
        return cachedReleaseData.count

      case HTTP_OK_REGEX.test(statusCode.toString()):
        // Has been modified
        logger.info(`${path} HAS changed. Updating cache & serving...`)
        releaseData.count = getDownloadCount(releaseData.body)

        let updatedDownload = downloadDoc(
          null,
          null,
          releaseData.body.id,
          releaseData.body.tag_name,
          releaseData.headers.etag,
          releaseData.headers['last-modified'],
          releaseData.count,
          releaseData.headers.date,
          ++cachedReleaseData.requests
        )

        // Update cache
        var outcome = await downloads.updateOne(findFilter, {$set: updatedDownload}, DEFAULT_DB_UPDATE_OPTS)
        logOutcome(outcome.modifiedCount, 1, 'update download', path)
        // Serve from freshly fetched data
        return releaseData.count

      default:
        // Unknown error occurred
        logger.error(new Error(`Got bad response ${releaseData.headers.status},
          full response`, '\n', inspectObj(releaseData)))
        // Still serve from cache
        return cachedReleaseData.count
    }
  }
}



/**
 * Controllers
 *************/

/**
 * GET a badge for a single release
 * DEFAULTs to latest
 */
exports.release = async function(ctx, next) {
  const shieldsURI = ctx.query[SHIELDS_URI_PARAM] || DEFAULT_SHIELDS_URI,
    ghURI = buildGhURI(ctx.params.owner, ctx.params.repo, GH_API_DEFAULT_RPATH)

  logger.info(`GH API Request URL ${ghURI}`)
  // make appropriate cache find request
  try {
    let badgeDownloads = await getBadgeData(ghURI, ctx.downloads, null, ctx.path)
    let shieldsReqURI = sub(shieldsURI, numeral(badgeDownloads).format())
    let badge = await getBadge(shieldsReqURI)
    // Response
    ctx.statusCode = HTTP_OK_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  } catch (e) {
    logger.error(e)
    let shieldsReqURI = sub(DEFAULT_SHIELDS_URI, DEFAULT_PLACEHOLDER)
    let badge = await getBadge(shieldsReqURI)
    ctx.statusCode = HTTP_PARTIAL_CONTENT_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  }
}


/**
 * GET a badge for a single release by id
 * DEFAULTs to latest
 */
exports.releaseById = async function(ctx, next) {
  const shieldsURI = ctx.query[SHIELDS_URI_PARAM] || DEFAULT_SHIELDS_URI,
    ghURI = buildGhURI(ctx.params.owner, ctx.params.repo, ctx.params.id)

  logger.info(`GH API Request URL ${ghURI}`)
  try {
    let badgeDownloads = await getBadgeData(ghURI, ctx.downloads, {ghId: parseInt(ctx.params.id)}, ctx.path)
    let shieldsReqURI = sub(shieldsURI, numeral(badgeDownloads).format())
    let badge = await getBadge(shieldsReqURI)
    // Response
    ctx.statusCode = HTTP_OK_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  } catch (e) {
    logger.error(e)
    let shieldsReqURI = sub(DEFAULT_SHIELDS_URI, DEFAULT_PLACEHOLDER)
    let badge = await getBadge(shieldsReqURI)
    ctx.statusCode = HTTP_PARTIAL_CONTENT_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  }
}


/**
 * GET a badge for a single release by tag
 * DEFAULTs to latest
 */
exports.releaseByTag = async function(ctx, next) {
  const shieldsURI = ctx.query[SHIELDS_URI_PARAM] || DEFAULT_SHIELDS_URI,
    ghURI = buildGhURI(ctx.params.owner, ctx.params.repo, GH_API_TAGS_RPATH , ctx.params.tag)

  logger.info(`GH API Request URL ${ghURI}`)
  try {
    let badgeDownloads = await getBadgeData(ghURI, ctx.downloads, {ghTag: ctx.params.tag}, ctx.path)
    let shieldsReqURI = sub(shieldsURI, numeral(badgeDownloads).format())
    let badge = await getBadge(shieldsReqURI)
    // Response
    ctx.statusCode = HTTP_OK_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  } catch (e) {
    logger.error(e)
    let shieldsReqURI = sub(DEFAULT_SHIELDS_URI, DEFAULT_PLACEHOLDER)
    let badge = await getBadge(shieldsReqURI)
    ctx.statusCode = HTTP_PARTIAL_CONTENT_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  }
}


/**
 * GET a badge of all-time total download count (all releases)
 */
exports.total = async function(ctx, next) {
  const ghURI = buildGhURI(ctx.params.owner, ctx.params.repo),
    shieldsURI = ctx.query[SHIELDS_URI_PARAM] || DEFAULT_SHIELDS_URI

  try {
    let badgeDownloads = await getBadgeTotalData(ghURI, ctx.downloads, null, ctx.path)
    let shieldsReqURI = sub(shieldsURI, numeral(badgeDownloads).format())
    let badge = await getBadge(shieldsReqURI)
    // Response
    ctx.statusCode = HTTP_OK_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  } catch (e) {
    logger.error(e)
    let shieldsReqURI = sub(DEFAULT_SHIELDS_URI, DEFAULT_PLACEHOLDER)
    let badge = await getBadge(shieldsReqURI)
    ctx.statusCode = HTTP_PARTIAL_CONTENT_CODE
    ctx.type = badge.type
    ctx.body = badge.body
  }
}


/**
 * GET status of GH API usage
 */
exports.status = async function(ctx, next) {
  try {
    let res = await req(buildGhApiOpts(GH_API_STATUS_URI))
    let resBody = 'GH API Status<br>'
    for (var stat in res.body.rate) {
      if (stat === 'reset') resBody += `${stat}: ${new Date(res.body.rate[stat] * 1000).toLocaleString()}<br>`
      else resBody += `${stat}: ${res.body.rate[stat]}<br>`
    }
    ctx.type = 'text/html'
    ctx.body = resBody
  } catch (e) {
    logger.error(e)
  }
}