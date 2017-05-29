'use strict'
/**
 * GET Badges
 * Controllers for badge routes
 ******************************/

// Deps
const req = require('request-promise-native'),
  logger = require('winston'),
  numeral = require('numeral'),
  parseLink = require('parse-link-header'),
  _ = require('lodash'),
  querystring = require('querystring'),
  normalizeUrl = require('normalize-url')

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
  DEFAULT_DB_COLLECTION = 'downloads',
  SUB_REGEX = /%s/g

// HTTP stuff
const HTTP_NOT_MODIFIED_CODE = 304,
  HTTP_FORBIDDEN_CODE = 403,
  HTTP_OK_CODE = 200,
  HTTP_PARTIAL_CONTENT_CODE = 206,
  HTTP_OK_REGEX = /^2/

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

// Build request options
function buildGhApiOpts (URI, opts) {
  return _.merge({
    uri: URI,
    headers: {
      // Required for GitHub API
      'User-Agent': DEFAULT_REQ_UA,
      'Accept': 'application/vnd.github.v3.full+json',
      'Authorization': `token ${GH_API_OAUTH_TOKEN}`
    },
    resolveWithFullResponse: true,
    json: true
  }, opts)
}

// String template substition
function sub (str, ...subs) {
  let n = 0
  return str.replace(SUB_REGEX, () => {
    return subs[n++]
  })
}

/**
 * Mongodb 'downloads' Collection Schema
 * Generates a mongodb 'download' document
 */
function Schema (path, ghURI, ghId, ghTag, ...fields) {
  let schema = {
    ghETAG: fields[0],
    ghLastMod: fields[1],
    count: fields[2],
    lastUpdated: fields[3],
    requests: fields[4]
  }
  if (path) schema.path = path
  if (ghURI) schema.ghURI = ghURI
  if (ghId) schema.ghId = ghId
  if (ghTag) schema.ghTag = ghTag
  return schema
}

// Builds the GitHub API Request URI
function buildGhURI (owner, repo, ...paths) {
  const apiReqBase = sub(GH_API_BASE_URI, owner, repo)
  if (_.isEmpty(paths)) return apiReqBase
  return `${apiReqBase}/${paths.join('/')}`
}

// Build querystring (for pagination)
function buildPageQsUri (uri, page) {
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

// Calculates the total download count for a single release
function getReleaseDownloadCount (release) {
  return release.assets.reduce((acc, r) => {
    return acc + r.download_count
  }, 0)
}

// Gets the total download count
function getDownloadCount (resBody) {
  if (_.isArray(resBody)) {
    // Calculate download count for all releases
    let totalCountArr = resBody.map((release) => getReleaseDownloadCount(release))
    return _.sum(totalCountArr)
  } else {
    // Calculate download count for a single release
    return getReleaseDownloadCount(resBody)
  }
}

// Gets the badge from the passed shields URI
function getBadge (shieldsReqURI) {
  return req(buildBadgeOpts(shieldsReqURI))
    .then((res) => {
      return {type: res.headers['content-type'], body: res.body}
    })
}

// Gets the release data with count
function getReleaseData (url, extraOpts) {
  return req(buildGhApiOpts(url, extraOpts))
    .then((res) => {
      res.count = getDownloadCount(res.body)
      return res
    })
}

// Log the outcome of a db operation
function logOutcome (val, equal, op, url) {
  if (_.isEqual(val, equal)) {
    logger.info(`${url} ${op} successful`)
  } else {
    logger.error(`${url} ${op} unsuccessfull`)
  }
}

// Identify request
function resolveReq (reqArr, origin) {
  let requestIndex = _.findIndex(reqArr, (o) => o.origin == origin)
  if (requestIndex !== -1) {
    // Known request
    reqArr[requestIndex].count++
  } else {
    // New request
    reqArr.push({
      origin: origin,
      count: 1
    })
  }
  return reqArr
}

async function fetchParallel (urls) {
  // fetch all the URLs in parallel
  const pagePromises = urls.map(async url => {
    return await req(buildGhApiOpts(url))
  })

  // log them in sequence
  for (const pagePromise of pagePromises) {
    console.log(await pagePromise)
  }
}

async function getBadgeTotalData (ghURI) {
  const startURI = buildPageQsUri(ghURI)
  const firstPage = await req(buildGhApiOpts(startURI))
  var downloadCount = 0

  downloadCount += getDownloadCount(firstPage.body)

  logger.info(`startURI: ${startURI}, firstPage downloadCount: ${downloadCount}`)

  if (_.has(firstPage, 'headers.link')) {
    // Response is paginated
    logger.info(`Response IS paginated`)
    let linkHeader = parseLink(firstPage.headers.link)
    let lastPage = parseInt(linkHeader.last.page)
    let nextPage = 2

    // Traverse pages
    const pageFetchPromises = _.range(nextPage, lastPage+1).map(async page => {
      let pageURI = buildPageQsUri(ghURI, page)
      logger.debug(`Next page to fetch ${pageURI}`)
      return await req(buildGhApiOpts(pageURI))
    })

    // Fetch the pages in sequence
    for (const pageFetchPromise of pageFetchPromises) {
      let fetchedPage = await pageFetchPromise
      downloadCount += getDownloadCount(fetchedPage.body)
      logger.debug(`Fetched ${fetchedPage.request.href}, downloadCount: ${downloadCount}`)
    }

  } else {
    // Response is not paginated
    logger.info(`Response is NOT paginated`)
  }
  return downloadCount
}


/**
 * Get the badge data (#downloads)
 * From cache or via GitHub API
 * @param  {String} ghURI GitHub API Request URI
 * @param  {Object} ctx   Koa context
 * @return {Number}       Download count
 */
// TODO: Modularise
async function getBadgeData (ghURI, downloads, findFilter, path, origin, total) {
  findFilter = findFilter || {path}
  // Query cache for existence
  const cachedReleaseData = await downloads.findOne(findFilter)

  logger.debug(`Cached data: ${JSON.stringify(cachedReleaseData)}`)
  logger.info(`Normalized Request path ${path}`)

  if (_.isEmpty(cachedReleaseData)) {
    // Not in cache so fetch
    logger.info(`${path} NOT IN cache. Fetching...`)

    // Fetch release data
    let releaseData = await getReleaseData(ghURI)

    // Update cache
    let outcome = await downloads.insertOne(Schema(
      path,
      ghURI,
      releaseData.body.id,
      releaseData.body.tag_name,
      releaseData.headers.etag,
      releaseData.headers['last-modified'],
      releaseData.count,
      releaseData.headers.date,
      [{
        origin: origin,
        count: 1
      }]
    ))

    logOutcome(outcome.insertedCount, 1, 'insert', path)

    return releaseData.count
  } else {
    // In cache
    logger.info(`${path} IN cache. Checking if changed`)

    let requests = resolveReq(cachedReleaseData.requests, origin)
    let updateOpts = {
      returnOriginal: false
    }
    let extraOpts = {
      simple: false,
      headers: {
        'If-None-Match': cachedReleaseData.ghETAG
      }
    }

    // Fetch release data
    let releaseData = await req(buildGhApiOpts(ghURI, extraOpts))
    const statusCode = releaseData.statusCode

    logger.info(`Got response ${releaseData.headers.status}.`)
    // Check if outdated
    switch (true) {
      case statusCode === HTTP_NOT_MODIFIED_CODE:
        // Has not been modified
        logger.info(`${path} has NOT changed. Serving from cache...`)
        // Update cache requests
        var outcome = await downloads.updateOne(findFilter, {$set: {requests: requests}}, updateOpts)
        logOutcome(outcome.modifiedCount, 1, 'update requests', path)
        // Serve from cache
        return cachedReleaseData.count

      case statusCode === HTTP_FORBIDDEN_CODE:
        // GitHub API Limit reached
        var outcome = await downloads.updateOne(findFilter, {$set: {requests: requests}}, updateOpts)
        logOutcome(outcome.modifiedCount, 1, 'update requests', path)
        // Serve from cache
        return cachedReleaseData.count

      case HTTP_OK_REGEX.test(releaseData.statusCode.toString()):
        // Has been modified
        logger.info(`${path} HAS changed. Updating cache & serving...`)
        releaseData.count = getDownloadCount(releaseData.body)

        let updatedDownload = Schema(
          null,
          null,
          releaseData.body.id,
          releaseData.body.tag_name,
          releaseData.headers.etag,
          releaseData.headers['last-modified'],
          releaseData.count,
          releaseData.headers.date,
          requests
        )

        // Update cache
        var outcome = await downloads.updateOne(findFilter, {$set: updatedDownload}, updateOpts)
        logOutcome(outcome.modifiedCount, 1, 'update download', path)
        // Serve from freshly fetched data
        return releaseData.count

      default:
        // Reject async fn with error occurred
        throw new Error(`Got response ${releaseData.headers.status} from GH API at ${releaseData.headers['x-ratelimit-remaining']} used limit`)
    }
  }
}

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
    let badgeDownloads = await getBadgeData(ghURI, ctx.db.collection(DEFAULT_DB_COLLECTION), null, ctx.path, ctx.origin)
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
    let badgeDownloads = await getBadgeData(ghURI, ctx.db.collection(DEFAULT_DB_COLLECTION), {ghId: parseInt(ctx.params.id)}, ctx.path, ctx.origin)
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
    let badgeDownloads = await getBadgeData(ghURI, ctx.db.collection(DEFAULT_DB_COLLECTION), {ghTag: ctx.params.tag}, ctx.path, ctx.origin)
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
// TODO: Implement this
exports.total = async function(ctx, next) {
  const ghURI = buildGhURI(ctx.params.owner, ctx.params.repo),
    shieldsURI = ctx.query[SHIELDS_URI_PARAM] || DEFAULT_SHIELDS_URI

  try {
    let badgeDownloads = await getBadgeData(ghURI, ctx.db.collection(DEFAULT_DB_COLLECTION), null, ctx.path, ctx.origin)
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

exports.debug = async function(ctx, next) {
  // const reqURL = normalizeUrl(ctx.path, { removeQueryParameters: [SHIELDS_URI_PARAM]})
  logger.debug(`url: ${ctx.url}, originalUrl: ${ctx.originalUrl}, path: ${ctx.path}`)
  // logger.info(`isReqValid: ${isReqValid(ctx.query)}`)
  // logger.info(JSON.stringify(ctx.query))
  try {
    ctx.body = 'debug'
  } catch (e) {
    logger.error(e)
  }
}
