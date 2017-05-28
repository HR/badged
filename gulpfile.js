var gulp = require('gulp')
var nodemon = require('gulp-nodemon')
var env = require('gulp-env')

gulp.task('nodemon', function () {
  env({
    file: '.env',
    vars: {}
  })

  nodemon({
    script: 'app.js',
    ext: 'js'
  })
})

gulp.task('default', ['nodemon'])
