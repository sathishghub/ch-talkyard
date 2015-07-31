/**
 * Build file for client scripts and styles.
 * Copyright (C) 2014 Kaj Magnus Lindberg (born 1979)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Commands:
 *
 *   gulp          - build everything for development
 *   gulp release  - build and minify everything, for release
 *   gulp watch    - continuously rebuild things that change
 */

var gulp = require('gulp');
var newer = require('gulp-newer');
var typeScript = require('gulp-typescript');
var liveScript = require('gulp-livescript');
var stylus = require('gulp-stylus');
var minifyCSS = require('gulp-minify-css');
var concat = require('gulp-concat');
var rename = require("gulp-rename");
var header = require('gulp-header');
var wrap = require('gulp-wrap');
var uglify = require('gulp-uglify');
var gzip = require('gulp-gzip');
var es = require('event-stream');
var fs = require("fs");
var path = require("path");

var watchAndLiveForever = false;



var copyrightAndLicenseBanner =
  '/*!\n' +
  ' * This file is copyrighted and licensed under the AGPL license.\n' +
  ' * Some parts of it might be licensed under more permissive\n' +
  ' * licenses, e.g. MIT or Apache 2. Find the source code and\n' +
  ' * exact details here:\n' +
  ' *   https://github.com/debiki/debiki-server\n' +
  ' */\n';

var thisIsAConcatenationMessage =
  '/*!\n' +
  ' * This file is a concatenation of many different files.\n' +
  ' * Each such file has its own copyright notices. Some parts\n' +
  ' * are released under other more permissive licenses\n' +
  ' * than the AGPL. Files are separated by a "======" line.\n' +
  ' */\n';

var nextFileLine =
  '\n\n//=== Next file: ===============================================================\n\n';


// What about using a CDN for jQuery + Modernizr + React? Perhaps, but:
// - jQuery + Modernizr + React is only 33K + 5K + 49K in addition to 160K
//   for everything else, so it's just 90K ~= 50% extra stuff, doesn't matter much?
//   (Once jQuery UI is gone — that one is 62K.)
//   (combined-debiki.min.js.gz is 303K now instead of 157K, but jQuery UI is included.
//   combined-debiki.min.css.gz is 32K (incl Bootstrap) that seems small enough.)
// - I think I've noticed before that cdnjs.com was offline for a short while.
// - If people don't have our version of everything cached already, there
//   might be DNS lookups and SSL handshakes, which delays the page load with
//   perhaps some 100ms? See:
//      https://thethemefoundry.com/blog/why-we-dont-use-a-cdn-spdy-ssl/
// - Testing that fallbacks to locally served files work is boring.
// - Plus I read in comments in some blog that some countries actually sometimes
//   block Google's CDN.
var debikiJavascriptFiles = [
      // Concerning when/how to use a CDN for Modernizr, see:
      // http://www.modernizr.com/news/modernizr-and-cdns
      // And: "For best performance, you should have them follow after your
      // stylesheet references", http://modernizr.com/docs/#installing
      // But placing Modernizr in the <head> is important mostly for IE8, which we don't support.
      // There might be a flash-of-unstyled-content now with Modnernizr here at the end
      // of <body>? But I haven't noticed any FOUC so ignore for now.
      'bower_components/modernizr/modernizr.js',
      'bower_components/yepnope/yepnope.1.5.4-min.js',
      'bower_components/jquery/jquery.js',
      'client/third-party/abbreviate-jquery.js',
      'bower_components/jquery-ui/ui/jquery-ui.js', // try to remove
      'bower_components/react/react-with-addons.js',
      'bower_components/keymaster/keymaster.js',
      // keymaster.js declares window.key, rename it to window.keymaster instead,
      // see comment in file for details.
      'client/third-party/rename-key-to-keymaster.js',
      'bower_components/lodash/dist/lodash.js',
      'bower_components/moment/min/moment.min.js',
      'bower_components/eventemitter2/lib/eventemitter2.js',
      'bower_components/react-bootstrap/react-bootstrap.js',
      'bower_components/react-router/build/umd/ReactRouter.js',
      'bower_components/Caret.js/dist/jquery.caret.js',
      'bower_components/jquery.atwho/dist/js/jquery.atwho.js',
      'bower_components/nicescroll/jquery.nicescroll.js',
      'client/third-party/bootstrap/dropdown.js',
      'client/third-party/bootstrap/tab.js',
      'client/third-party/diff_match_patch.js',
      'client/third-party/gifffer/gifffer.js',
      'client/third-party/html-css-sanitizer-bundle.js',
      'client/third-party/jquery-cookie.js',
      'client/third-party/jquery-scrollable.js', //
      'client/third-party/jquery.browser.js', //
      'client/third-party/livescript/prelude-browser.js',
      'client/third-party/non-angular-slugify.js',
      'client/third-party/popuplib.js',
      'client/third-party/modernizr-positionfixed.js',
      'client/app/actions/edit/tagdog.js',
      'target/client/app/page-module.js',
      'target/client/app/actions/delete.js',
      'target/client/app/actions/dialogs.js',
      'target/client/app/actions/edit/edit.js',
      'target/client/app/actions/flag.js',
      'target/client/app/old/actions/show-actions.js',
      'target/client/app/actions/vote.js',
      'target/client/app/actions/reply.js',
      'target/client/app/current-user.js',
      'target/client/app/actions/edit/diff-match-patch.js',
      'target/client/app/actions/edit/history.js',
      'target/client/app/utils/http-dialogs.js',
      //'target/client/app/inline-threads-unused.js',
      'target/client/app/iframe.js',
      'target/client/shared/debiki-jquery-dialogs.js',
      'target/client/shared/show-server-response-dialog.js',
      'target/client/app/utils/jquery-find.js',
      'target/client/app/posts/layout.js',
      'target/client/app/posts/load-page-parts.js',
      'target/client/app/login/login.js',
      'target/client/app/login/login-popup.js',
      'target/client/app/editor/mentions-markdown-it-plugin.js',
      'target/client/app/editor/onebox-markdown-it-plugin.js',
      'target/client/shared/login-dialog/login-dialog.js',
      'target/client/shared/login-dialog/login-guest.js',
      'target/client/shared/login-dialog/login-password.js',
      'target/client/shared/login-dialog/login-openid.js',
      'target/client/shared/login-dialog/login-openid-dialog-html.js',
      'target/client/shared/login-dialog/create-user-dialog.js',
      'target/client/app/actions/edit/markup.js',
      'target/client/page/scripts/debiki-merge-changes.js',
      //'target/client/app/posts/monitor-reading-progress-unused.js',
      'target/client/app/posts/patch-page.js',
      'target/client/app/actions/pin.js',
      'target/client/app/posts/resize.js',
      'target/client/app/utils/scroll-into-view.js',
      'target/client/app/utils/show-and-highlight.js',
      'target/client/app/posts/show-comments-section.js',
      'target/client/app/utils/show-location-in-nav.js',
      //'target/client/app/posts/unread-unused.js',
      'target/client/app/utils/util.js',
      'target/client/app/utils/util-browser.js',
      'target/client/app/utils/util-play.js',
      'target/client/app/utterscroll/utterscroll-init-tips.js',//
      'client/app/utterscroll/utterscroll.js',//
      'target/client/app/utils/page-path.js',
      'target/client/app/utils/create-page.js',
      'target/client/shared/post-json.js',
      'target/client/all-typescript.js',
      'target/client/app/startup.js'];


// For both touch devices and desktops.
var loginDialogFiles = [
      'client/third-party/jquery-cookie.js',
      'target/client/shared/debiki-jquery-dialogs.js',
      'target/client/shared/show-server-response-dialog.js',
      'target/client/shared/post-json.js',
      'target/client/shared/login-dialog/login-dialog.js',
      'target/client/shared/login-dialog/login-guest.js',
      'target/client/shared/login-dialog/login-password.js',
      'target/client/shared/login-dialog/login-openid.js',
      'target/client/shared/login-dialog/login-openid-dialog-html.js',
      'target/client/shared/login-dialog/create-user-dialog.js'];


// For both touch devices and desktops.
// (parten-header.js and parent-footer.js wraps and lazy loads the files inbetween,
// see client/embedded-comments/readme.txt.)
var debikiEmbeddedCommentsFiles = [
      'client/embedded-comments/parent-header.js',  // not ^target/client/...
      'client/third-party/jquery-scrollable.js',
      'client/third-party/jquery.browser.js',
      'target/client/embedded-comments/debiki-utterscroll-iframe-parent.js',
      'target/client/app/utterscroll/utterscroll-init-tips.js',
      'target/client/embedded-comments/iframe-parent.js',
      'client/embedded-comments/parent-footer.js'];  // not ^target/client/...


gulp.task('wrap-javascript', function () {
  // Prevent Javascript variables from polluting the global scope.
  return gulp.src('client/**/*.js')
    .pipe(wrap('(function() {\n<%= contents %>\n}).call(this);'))
    .pipe(gulp.dest('./target/client/'));
});


gulp.task('compile-livescript', function () {
  return gulp.src('client/**/*.ls')
    .pipe(liveScript())
    .pipe(gulp.dest('./target/client/'));
});

var serverSideTypescriptProject = typeScript.createProject({
    target: 'ES5',
    allowBool: true,
    noExternalResolve: true,
    out: 'renderer.js'
});


function compileServerSideTypescript() {
  var typescriptStream = gulp.src([
        'client/server/**/*.ts',
        'client/shared/plain-old-javascript.d.ts',
        'client/typedefs/**/*.ts'])
    .pipe(typeScript(serverSideTypescriptProject));

  if (watchAndLiveForever) {
    typescriptStream.on('error', function() {
      console.log('\n!!! Error compiling server side TypeScript !!!\n');
    });
  }

  var javascriptStream = gulp.src([
        'bower_components/react/react-with-addons.js',
        'bower_components/react-bootstrap/react-bootstrap.js',
        'bower_components/react-router/build/umd/ReactRouter.js',
        'bower_components/markdown-it/dist/markdown-it.js',
        'bower_components/lodash/dist/lodash.js',
        'client/third-party/html-css-sanitizer-bundle.js',
        'client/third-party/non-angular-slugify.js',
        'client/app/editor/mentions-markdown-it-plugin.js',
        'client/app/editor/onebox-markdown-it-plugin.js',
        'bower_components/moment/moment.js']);

  return es.merge(typescriptStream, javascriptStream)
      .pipe(concat('renderer.js'))
      .pipe(gulp.dest('public/res/'))
      .pipe(uglify())
      .pipe(rename('renderer.min.js'))
      .pipe(gulp.dest('public/res/'));
}


var clientSideTypescriptProject = typeScript.createProject({
    target: 'ES5',
    allowBool: true,
    noExternalResolve: true,
    out: 'all-typescript.js'
});


function compileClientSideTypescript() {
  var stream = gulp.src([
        'client/app/**/*.ts',
        'client/shared/plain-old-javascript.d.ts',
        'client/typedefs/**/*.ts'])
    .pipe(typeScript(clientSideTypescriptProject));

  if (watchAndLiveForever) {
    stream.on('error', function() {
      console.log('\n!!! Error compiling TypeScript !!!\n');
    });
  }

  return stream.pipe(gulp.dest('target/client/'));
}


gulp.task('compile-typescript', function () {
  return es.merge(
      compileServerSideTypescript(),
      compileClientSideTypescript());
});



gulp.task('concat-debiki-scripts', [
    'wrap-javascript',
    'compile-livescript',
    'compile-typescript'], function() {
  return makeConcatDebikiScriptsStream();
});



function makeConcatDebikiScriptsStream() {
  function makeConcatStream(outputFileName, filesToConcat) {
    return gulp.src(filesToConcat)
        .pipe(newer('public/res/' + outputFileName))
        .pipe(header(nextFileLine))
        .pipe(concat(outputFileName))
        .pipe(header(thisIsAConcatenationMessage))
        .pipe(header(copyrightAndLicenseBanner))
        .pipe(gulp.dest('public/res/'));
  }

  return es.merge(
      makeConcatStream('combined-debiki.js', debikiJavascriptFiles),
      makeConcatStream('login-popup.js', loginDialogFiles),
      makeConcatStream('embedded-comments.js', debikiEmbeddedCommentsFiles),
      gulp.src('bower_components/zxcvbn/zxcvbn.js').pipe(gulp.dest('public/res/')));
};



gulp.task('wrap-javascript-concat-scripts', ['wrap-javascript'], function () {
  return makeConcatAllScriptsStream();
});

gulp.task('compile-livescript-concat-scripts', ['compile-livescript'], function () {
  return makeConcatDebikiScriptsStream();
});

gulp.task('compile-typescript-concat-scripts', ['compile-typescript'], function () {
  return makeConcatDebikiScriptsStream();
});

gulp.task('compile-templates-concat-scripts', [], function () {
  return makeConcatDebikiScriptsStream();
});

gulp.task('compile-concat-scripts',
    ['wrap-javascript', 'compile-livescript', 'compile-typescript'],
    function () {
  return makeConcatAllScriptsStream();
});

function makeConcatAllScriptsStream() {
  // I've removed some other scripts (CodeMirror) so now suddenly there's nothing to merge.
  return es.merge(
      makeConcatDebikiScriptsStream());
};



gulp.task('minify-scripts', ['concat-debiki-scripts'], function() {
  return gulp.src(['public/res/*.js', '!public/res/*.min.js'])
      .pipe(uglify())
      .pipe(rename({ extname: '.min.js' }))
      .pipe(header(copyrightAndLicenseBanner))
      .pipe(gulp.dest('public/res/'))
      .pipe(gzip())
      .pipe(gulp.dest('public/res/'));
});



gulp.task('compile-stylus', function () {

  var stylusOpts = {
    linenos: true,
    // Could include:  use: [nib()]
  };

  var minifyOpts = {
    keepSpecialComments: 0
  };

  function makeStyleStream(destDir, destFile, sourceFiles) {
    var stream = gulp.src(sourceFiles)
      .pipe(stylus(stylusOpts));

    if (watchAndLiveForever) {
      // This has no effect, why not?
      stream.on('error', function() {
        console.log('\n!!! Error compiling Stylus !!!\n');
      });
    }

    return stream
      .pipe(concat(destFile))
      .pipe(gulp.dest(destDir))
      .pipe(minifyCSS(minifyOpts))
      .pipe(header(copyrightAndLicenseBanner))
      .pipe(rename({ extname: '.min.css' }))
      .pipe(gulp.dest(destDir))
      .pipe(gzip())
      .pipe(gulp.dest(destDir));
  }

  return es.merge(
    makeStyleStream('public/res/', 'combined-debiki.css', [
        'bower_components/bootstrap/dist/css/bootstrap.css',
        'bower_components/jquery.atwho/dist/css/jquery.atwho.css',
        'public/res/jquery-ui/jquery-ui-1.9.2.custom.css',
        'client/app/debiki.styl',
        'client/app/posts/layout.styl',
        'client/app/sidebar/minimap.styl',
        'client/app/renderer/arrows.styl',
        'client/app/tips.styl',
        'client/app/dashbar/dashbar.styl',
        'client/app/debiki-play.styl',
        'client/app/actions/action-links.styl',
        'client/app/forms-and-dialogs.styl',
        'client/app/login/login.styl',
        'client/app/third-party.styl',
        'client/app/**/*.styl',
        'client/app/**/theme.css']),

    makeStyleStream('public/res/', 'debiki-embedded-comments.css', [
        'client/app/tips.styl']));
});



gulp.task('watch', ['default'], function() {

  watchAndLiveForever = true;

  function logChangeFn(fileType) {
    return function(event) {
      console.log(fileType + ' file '+ event.path +' was '+ event.type +', running tasks...');
    };
  };

  gulp.watch('client/**/*.html', ['compile-templates-concat-scripts']).on('change', logChangeFn('HTML'));
  gulp.watch('client/**/*.ts', ['compile-typescript-concat-scripts']).on('change', logChangeFn('TypeScript'));
  gulp.watch('client/**/*.ls', ['compile-livescript-concat-scripts']).on('change', logChangeFn('LiveScript'));
  gulp.watch('client/**/*.js', ['wrap-javascript-concat-scripts']).on('change', logChangeFn('Javascript'));
  gulp.watch('client/**/*.styl', ['compile-stylus']).on('change', logChangeFn('Stylus'));
  gulp.watch(['app/views/themes/**/*.css', 'app/views/themesbuiltin/default20121009/styles.css/**/*.css']).on('change', logChangeFn('CSS'));
});


gulp.task('default', ['compile-concat-scripts', 'compile-stylus'], function () {
});


gulp.task('release', ['minify-scripts', 'compile-stylus'], function() {
});



// vim: et ts=2 sw=2 tw=0 list
