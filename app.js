'use strict'
/**
 * app.js
 * Entry point for the Badged App
 ******************************/

// Init logger to override console
const logger = require('./script/logger')

const controllersPath = `${__dirname}/controllers`,
  badge = require(`${controllersPath}/badge`),
  home = require(`${controllersPath}/home`),
  responseTime = require('koa-response-time'),
  serve = require('koa-static'),
  compress = require('koa-compress'),
  klogger = require('koa-logger'),
  _ = require('lodash'),
  koa = require('koa'),
  Router = require('koa-router'),
  // co = require('co'),
  MongoClient = require('mongodb').MongoClient,
  ENV = process.env.NODE_ENV || 'development',
  PORT = process.env.PORT || '4000',
  MONGODB_URI = process.env.MONGODB_URI

// Init
const app = new koa()
const router = new Router()
var _db

/**
 * Environment.
 */

// Protect against HTTP Parameter Pollution attacks
app.use(async (ctx, next) => {
  for (var param in ctx.query) {
    if (_.has(ctx.query, param)) {
      ctx.query[param] = _.isArray(ctx.query[param]) ? ctx.query[param][0] : ctx.query[param]
    }
  }
  ctx.url = encodeURI(ctx.url)
  await next()
})

// logging
if ('test' != ENV) app.use(klogger())

// Mongodb logging
require('mongodb').Logger.setLevel('info')

// serve static files
app.use(serve(`${__dirname}/public`))

// x-response-time
app.use(responseTime())

// Compress
app.use(compress())

// Add database to the context
app.use(async (ctx, next) => {
  ctx.db = _db
  await next()
})

/**
 * Routes
 */
router.get('/', home.index)
router.get('/debug', badge.debug)
router.get('/status', badge.status)
router.get('/:owner/:repo', badge.release)
router.get('/:owner/:repo/total', badge.total)

// catch all
router.get('/*', home.index)

app
  .use(router.routes())
  .use(router.allowedMethods())

MongoClient.connect(MONGODB_URI)
  .then((db) => {
    _db = db
    logger.info(`Connected to db!`)
    app.listen(PORT, () => {
      logger.info(`listening on port ${PORT}`)
    })
  })
  .catch(function (err) {
    logger.error(err)
  })
