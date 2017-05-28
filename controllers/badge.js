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

const GH_API_BASE_URI = 'https://api.github.com/repos/%s/%s/releases',
  GH_API_STATUS_URI = 'https://api.github.com/rate_limit',
  GH_API_OAUTH_TOKEN = process.env.GH_API_OAUTH_TOKEN || '',
  GH_API_PAGE_SIZE = 100,
  GH_API_TAGS_RPATH = 'tags',
  GH_API_DEFAULT_RPATH = 'latest'

// Params
const RELEASE_ID_PARAM = 'id',
  RELEASE_TAG_PARAM = 'tag',
  SHIELDS_URI_PARAM = 'badge',
  ALLOWED_PARAMS = [RELEASE_ID_PARAM, RELEASE_TAG_PARAM, SHIELDS_URI_PARAM]

// Defaults
const DEFAULT_SHIELDS_URI = 'https://img.shields.io/badge/downloads-%s-green.svg',
  DEFAULT_PLACEHOLDER = 'X',
  DEFAULT_REQ_UA = 'Badge Getter',
  DEFAULT_MIME_TYPE = 'image/svg+xml',
  SUB_REGEX = /%s/g

// HTTP stuff
const HTTP_NOT_MODIFIED_CODE = 304,
  HTTP_FORBIDDEN_CODE = 403,
  HTTP_OK_REGEX = /^2/

function buildBadgeOpts (URL) {
  return {
    uri: URL,
    headers: {
      'User-Agent': DEFAULT_REQ_UA
    },
    resolveWithFullResponse: true,
    json: true
  }
}

// Build request options
function buildGhApiOpts (URL, opts) {
  return _.merge({
    uri: URL,
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
 * Generates a mongodb 'download' docuemnt
 */
function Schema (url, ghURI, ghETAG, ghLastMod, count, lastUpdated, requests) {
  let schema = {
    ghETAG: ghETAG,
    ghLastMod: ghLastMod,
    count: count,
    lastUpdated: lastUpdated,
    requests: requests
  }
  if (url) schema.url = url
  if (ghURI) schema.ghURI = ghURI
  return schema
}

// Builds the GitHub API Request URI from query params
function buildGhURI (owner, repo, query) {
  const apiReqBase = sub(GH_API_BASE_URI, owner, repo)
  if (!query) return apiReqBase
  switch (true) {
    case RELEASE_ID_PARAM in query:
      var apiReqURI = `${apiReqBase}/${query[RELEASE_ID_PARAM]}`
      break
    case RELEASE_TAG_PARAM in query:
      var apiReqURI = `${apiReqBase}/${GH_API_TAGS_RPATH}/${query[RELEASE_TAG_PARAM]}`
      break

    default:
      var apiReqURI = `${apiReqBase}/${GH_API_DEFAULT_RPATH}`
  }
  return apiReqURI
}

// Build querystring (for pagination)
function buildPageQS (page) {
  let qs = {
    per_page: GH_API_PAGE_SIZE
  }
  if (page) qs.page = page
  return '?' + querystring.stringify(qs)
}

// Checks if request url is valid
function isReqValid (reqUrlQuery) {
  // Check if only allowed params passed
  return _.isEmpty(_.omit(reqUrlQuery, ALLOWED_PARAMS))
}

// Gets the badge from the passed shields URI
function getBadge (shieldsReqURI) {
  return new Promise(function (resolve, reject) {
    req(buildBadgeOpts(shieldsReqURI))
      .then((res) => {
        resolve({type: res.headers['content-type'], body: res.body})
      })
      .catch((err) => {
        reject(err)
      })
  })
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
    return totalCountArr.reduce((a, b) => a + b, 0)
  } else {
    // Calculate download count for a single release
    return getReleaseDownloadCount(resBody)
  }
}

// Gets
function getReleaseData (url, extraOpts) {
  return new Promise(function (resolve, reject) {
    req(buildGhApiOpts(url, extraOpts))
      .then((res) => {
        return resolve({headers: res.headers, count: getDownloadCount(res.body)})
      })
      .catch((err) => {
        reject(err)
      })
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

async function getBadgeTotalData (ghURI, ctx) {
}
/**
 * Get the badge data (#downloads)
 * From cache or via GitHub API
 * @param  {String} ghURI GitHub API Request URI
 * @param  {Object} ctx   Koa context
 * @return {Number}       Download count
 */
// TODO: Modularise
async function getBadgeData (ghURI, ctx) {
  const url = normalizeUrl(ctx.url, { removeQueryParameters: [SHIELDS_URI_PARAM]})
  const downloads = ctx.db.collection('downloads')
  const cache = await downloads.find({ghURI: ghURI}).toArray()

  logger.info(JSON.stringify(cache), ' isEmpty: ', _.isEmpty(cache))
  logger.info(`Normalized Request URL ${url}`)

  if (_.isEmpty(cache)) {
    // Not in cache so fetch
    logger.info(`${url} NOT IN cache. Fetching...`)

    // Fetch release data
    let releaseData = await getReleaseData(ghURI)

    // Update cache
    let outcome = await downloads.insertOne(Schema(
      url,
      ghURI,
      releaseData.headers.etag,
      releaseData.headers['last-modified'],
      releaseData.count,
      releaseData.headers.date,
      [{
        origin: ctx.origin,
        count: 1
      }]
    ))

    logOutcome(outcome.insertedCount, 1, 'insert', url)

    return releaseData.count
  } else {
    // In cache
    logger.info(`${url} IN cache. Checking if changed`)

    let cachedReleaseData = cache[0]
    let requests = resolveReq(cachedReleaseData.requests, ctx.origin)
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
    let statusCode = releaseData.statusCode

    logger.info(`Got response ${releaseData.headers.status}.`)
    // Check if outdated
    switch (true) {
      case statusCode === HTTP_NOT_MODIFIED_CODE:
        // Has not been modified
        logger.info(`${url} has NOT changed. Serving from cache...`)
        // Update cache requests
        var outcome = await downloads.updateOne({ghURI: ghURI}, {$set: {requests: requests}}, updateOpts)
        logOutcome(outcome.modifiedCount, 1, 'update requests', url)
        // Serve from cache
        return cachedReleaseData.count

      case statusCode === HTTP_FORBIDDEN_CODE:
        // GitHub API Limit reached
        var outcome = await downloads.updateOne({ghURI: ghURI}, {$set: {requests: requests}}, updateOpts)
        logOutcome(outcome.modifiedCount, 1, 'update requests', url)
        // Serve from cache
        return cachedReleaseData.count

      case HTTP_OK_REGEX.test(releaseData.statusCode.toString()):
        // Has been modified
        logger.info(`${url} HAS changed. Updating cache & serving...`)
        releaseData.count = getDownloadCount(releaseData.body)

        let updatedDownload = Schema(
          null,
          null,
          releaseData.headers.etag,
          releaseData.headers['last-modified'],
          releaseData.count,
          releaseData.headers.date,
          requests
        )

        // Update cache
        var outcome = await downloads.updateOne({ghURI: ghURI}, {$set: updatedDownload}, updateOpts)
        logOutcome(outcome.modifiedCount, 1, 'update download', url)
        // Serve from freshly fetched data
        return releaseData.count

      default:
        // Unknown error occurred
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
    ghURI = buildGhURI(ctx.params.owner, ctx.params.repo, ctx.query)

  logger.info(`GH API Request URL ${ghURI}`)

  try {
    let badgeDownloads = await getBadgeData(ghURI, ctx)
    let shieldsReqURI = sub(shieldsURI, numeral(badgeDownloads).format())
    let badge = await getBadge(shieldsReqURI)
    // Response
    ctx.type = badge.type
    ctx.body = badge.body
  } catch (e) {
    logger.error(e)
    let shieldsReqURI = sub(DEFAULT_SHIELDS_URI, DEFAULT_PLACEHOLDER)
    let badge = await getBadge(shieldsReqURI)
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
    let badgeDownloads = await getBadgeTotalData(ghURI, ctx)
    let shieldsReqURI = sub(shieldsURI, numeral(badgeDownloads).format())
    // Response
    // ctx.type = RES_MIME_TYPE
    ctx.body = await getBadge(shieldsReqURI)
  } catch (e) {
    logger.error(e)
    let shieldsReqURI = sub(DEFAULT_SHIELDS_URI, DEFAULT_PLACEHOLDER)
    ctx.body = await getBadge(shieldsReqURI)
  }
}

/**
 * GET status of GH API usage
 */
exports.status = async function(ctx, next) {
  try {
    res = await req(buildGhApiOpts(GH_API_STATUS_URI))
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
  // const reqURL = normalizeUrl(ctx.url, { removeQueryParameters: [SHIELDS_URI_PARAM]})
  // logger.info(normalizeUrl(ctx.origin))
  // logger.info(`isReqValid: ${isReqValid(ctx.query)}`)
  // logger.info(JSON.stringify(ctx.query))
  try {
    ctx.body = 'debug'
  } catch (e) {
    logger.error(e)
  }
}
