const winston = require('winston')
const fs = require('fs-extra')
const logDir = `./logs`
const logFileOpts = {
  filename: `${logDir}`,
  datePattern: '/dd-MM-yyyy.log',
  prepend: false,
  colorize: false

}
const logConsoleOpts = {
  colorize: true
}

fs.ensureDirSync(logDir)

winston.configure({
  level: process.env.NODE_ENV === 'development' ? 'silly' : 'debug',
  exitOnError: false,
  emitErrs: true,
  handleExceptions: true,
  transports: [
    new (winston.transports.Console)(logConsoleOpts),
    new (require('winston-daily-rotate-file'))(logFileOpts)
  ]
})

// Override stdout console
console.log = winston.info
console.error = winston.error
console.info = winston.info

module.exports = winston
