'use strict'
/**
 * Sweet Home
 * Renders the README.md in GH style
 * (C) Habib Rehman
 ******************************/
 //TODO: Use template engine instead of hardcoded HTML strings
const showdown = require('showdown'),
  logger = require('winston'),
  converter = new showdown.Converter(),
  fs = require('fs-extra'),
  path = require('path'),
  README_PATH = path.join(__dirname, '..', 'README.md'),
  STYLESHEET_TAG = '<link rel="stylesheet" href="/github-markdown.css">'

/**
 * Main page
 * Convert README.MD to html
 */

exports.index = async function (ctx, next) {
  const readmeFile = await fs.readFile(README_PATH, 'utf8')
  let readmeFileHTML = `${STYLESHEET_TAG}<section class="markdown-body">${converter.makeHtml(readmeFile)}</section>`
  ctx.type = 'text/html'
  ctx.body = readmeFileHTML
}
