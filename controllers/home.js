'use strict'
/**
 * Sweet Home
 * Renders the README.md in GH style
 * (C) Habib Rehman
 ******************************/
const showdown = require('showdown'),
  logger = require('winston'),
  fs = require('fs-extra'),
  README_PATH = `${__dirname}/../README.md`,
  converter = new showdown.Converter()

let readmeHTML = '<h1>Oops, this is unexpected...</h1>'

fs.readFile(README_PATH, 'utf8')
  .then((readmeFile) => {
    readmeHTML = converter.makeHtml(readmeFile)
  })
  .catch((e) => {
    logger.error('Could not parse README, got error:', e)
  })



/**
 * Index
 */

exports.index = async function (ctx, next) {
 await ctx.render('home', {
   readmeHTML: readmeHTML
 })
}
