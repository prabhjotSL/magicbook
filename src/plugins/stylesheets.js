var _ = require('lodash');
var vfs = require('vinyl-fs');
var gutil = require('gulp-util');
var through = require('through2');
var fileHelpers = require('../helpers/file');
var streamHelpers = require('../helpers/stream');
var path = require('path');
var sass = require('node-sass');
var CleanCSS = require('clean-css');
var concat = require('gulp-concat');

// through2 function to remove whitespace from CSS files
// Returns: Vinyl filestream
function compress() {
  return through.obj(function(file, enc, cb) {
    new CleanCSS().minify(file.contents, function (err, minified) {
      file.contents = new Buffer(minified.styles);
      cb(err, file);
    });
  });
}

// through2 function to convert a scss file to css
// Returns: Vinyl filestream
function scss() {
  return through.obj(function (file, enc, cb) {
    if(fileHelpers.isScss(file)) {
      sass.render({ file: file.path }, function(err, result) {
        file.contents = result.css;
        file.path = gutil.replaceExtension(file.path, '.css');
        cb(err, file);
      });
    } else {
      cb(null, file);
    }
	});
}

var Plugin = function(){}

Plugin.prototype = {

  hooks: {

    setup: function(config, extras, callback) {

      var that = this;
      that.allFiles = [];

      // get the stylesheets needed for this format
      var stylesheets = _.get(config, "stylesheets.files");

      // if the array exists
      if(stylesheets) {

        var cssFolder = config.stylesheets.destination;
        var cssFolderAbsolute = path.join(extras.destination, cssFolder);

        // gather the files
        var cssStream = vfs.src(stylesheets)
          .pipe(scss());

        // bundle
        var bundle = _.get(config, "stylesheets.bundle");
        if(bundle) {
          var filename = _.isString(bundle) ? bundle : "bundle.css"
          cssStream = cssStream.pipe(concat(filename));
        }

        // compress
        if(_.get(config, "stylesheets.compress")) {
          cssStream = cssStream.pipe(compress());
        }

        // digest
        if(_.get(config, "stylesheets.digest")) {
          cssStream = cssStream.pipe(streamHelpers.digest());
        }

        // put all the filenames in the stylesheets array
        cssStream = cssStream.pipe(through.obj(function(file, enc, cb) {
          // save the path to the css file from within the build folder
          that.allFiles.push(path.join(cssFolder, file.relative));
          cb(null, file);
        }));

        // finish
        cssStream
          .pipe(vfs.dest(cssFolderAbsolute))
          .on('finish', function() {
            callback(null, config, extras);
          });

      } else {
        callback(null, config, extras);
      }
    },

    load: function(config, stream, extras, callback) {

      var allFiles = this.allFiles;

      // add the locals to the files liquidLocals
      stream = stream.pipe(through.obj(function(file, enc, cb) {

        var styles = "";
        _.each(allFiles, function(js) {
          styles += '<link rel="stylesheet" href="' + path.relative(path.dirname(file.relative), js) +'">\n';
        });

        file.liquidLocalsLayout = file.liquidLocalsLayout || {};
        file.liquidLocalsLayout.stylesheets = styles;

        cb(null, file);
      }));

      callback(null, config, stream, extras);
    }
  }
}

module.exports = Plugin;
