const gulp = require('gulp'),
  nodemon = require('gulp-nodemon'),
  env = require('gulp-env'),
  exec = require('child_process').exec

gulp.task('nodemon', function () {
  env({
    file: '.env',
    vars: {}
  })

  nodemon({
    script: 'app.js',
    verbose: true,
    debug: true,
    ignore: ['logs/', '*.log', '.DS_Store'],
    nodeArgs: ['--inspect'],
    ext: 'js json',
    events: {
      restart: "osascript -e 'display notification \"App restarted due to:\n'$FILENAME'\" with title \"nodemon\"'"
    }
  })
})

gulp.task('inspect', function (cb) {
  env({
    file: '.env',
    vars: {}
  })

  exec('./node_modules/.bin/nodemon --inspect-brk app.js', function (err, stdout, stderr) {
    console.log(stdout)
    console.log(stderr)
    cb(err)
  })
})

gulp.task('default', ['nodemon'])
