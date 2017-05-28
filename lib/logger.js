const winston = require('winston'),
  fs = require('fs-extra'),
  logDir = '../logs',
  logFileOpts = {
    filename: `${logDir}`,
    datePattern: '/dd-MM-yyyy.log',
    prepend: false,
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  },
  logConsoleOpts = {
    colorize: true,
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
}

winston.emitErrs = true
fs.ensureDirSync(logDir),

module.exports = new winston.Logger({
  level: 'info',
  exitOnError: false,
  handleExceptions: true,
  transports: [
    new (winston.transports.Console)(logConsoleOpts),
    new (require('winston-daily-rotate-file'))(logFileOpts)
  ]
})

// Override stdout console
console.log = module.exports.info
console.error = module.exports.error
console.info = module.exports.info
