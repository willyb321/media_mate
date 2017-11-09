'use strict';
import gulp from 'gulp';
import del from 'del';
import inject from 'gulp-inject';
import isCI from 'is-ci';
import {spawn} from 'child_process';
import builder from 'electron-builder';

let injects = [
	'./app/renderjs/notify.js',
	'./app/css/index.less',
	'./app/node_modules/mprogress/mprogress.min.js'
];

gulp.task('default', () => {
	// rimraf('app/main/indexbuild.js*', err => {
	// 	if (err && err.code !== 'ENOENT') {
	// 		console.log(err.codeFrame);
	// 		return err;
	// 	}
	// 	return gulp.src(['!node_modules',
	// 		'!node_modules/**',
	// 		'!app/menu.js',
	// 		'!dist',
	// 		'!app/renderjs',
	// 		'app/main/index.js',
	// 		'!app/lib',
	// 		'!app/indexbuild.js',
	// 		'!dist/**'])
	// 			.pipe(sourcemaps.init())
	// 			.pipe(babel({
	// 				presets: ['es2015'],
	// 				ignore: 'node_modules/**/*'
	// 			}))
	// 			.pipe(concat('indexbuild.js'))
	// 			.pipe(sourcemaps.write('.'))
	// 			.pipe(gulp.dest('app/main'));
	// });
});

gulp.task('build:pack', ['default'], cb => {
	builder.build({
		platform: process.platform,
		arch: 'x64',
		config: {
			appId: 'com.willyb321.media_mate',
			nsis: {
				oneClick: false,
				allowToChangeInstallationDirectory: true
			},
			mac: {
				category: 'public.app-category.entertainment',
				target: 'dmg'
			},
			win: {
				target: [
					'dir'
				],
				publish: [
					'github'
				]
			}
		}
	})
		.then(() => {
			console.log('Built the app in dist/');
			cb();
		})
		.catch(err => {
			console.error(err);
		});
});
gulp.task('build:dist', ['default'], cb => {
	builder.build({
		platform: (isCI === true && process.platform === 'linux' ? ['linux', 'win32'] : process.platform),
		arch: 'x64',
		config: {
			appId: 'com.willyb321.media_mate',
			nsis: {
				oneClick: false,
				allowToChangeInstallationDirectory: true
			},
			mac: {
				category: 'public.app-category.entertainment',
				target: ['zip'],
				publish: [
					"github"
				]
			},
			win: {
				target: [
					'nsis'
				],
				publish: [
					'github'
				]
			}
		}
	})
		.then(() => {
			console.log('Built an installer for the current platform in dist/');
			cb();
		})
		.catch(err => {
			console.error(err);
		});
});
gulp.task('clean', () => {
	return del(['dist/**/*', 'node_modules/', 'app/node_modules/']);
});
gulp.task('index', () => {
	let filename;
	filename = './app/renderjs/releasenotes.js';
	injects.push(filename);
	gulp.src(['./app/renderhtml/releasenotes.html', '!./app/node_modules/**'])
		.pipe(inject(gulp.src(injects, {read: false}), {relative: true}))
		.pipe(gulp.dest('./app/renderhtml'));
	injects.pop();
	filename = './app/renderjs/downloader.js';
	injects.push(filename);
	gulp.src(['./app/renderhtml/downloader.html', '!./app/node_modules/**'])
		.pipe(inject(gulp.src(injects, {read: false}), {relative: true}))
		.pipe(gulp.dest('./app/renderhtml/'));
	filename = './app/renderjs/streamer.js';
	injects.pop();
	injects.push(filename);
	gulp.src(['./app/renderhtml/streamer.html', '!./app/node_modules/**'])
		.pipe(inject(gulp.src(injects, {read: false}), {relative: true}))
		.pipe(gulp.dest('./app/renderhtml/'));
	injects.pop();
	gulp.src(['./app/renderhtml/index.html', '!./app/node_modules/**'])
		.pipe(inject(gulp.src(injects, {read: false}), {relative: true}))
		.pipe(gulp.dest('./app/renderhtml/'));
	gulp.src(['./app/renderhtml/onboard.html', '!./app/node_modules/**'])
		.pipe(inject(gulp.src(injects, {read: false}), {relative: true}))
		.pipe(gulp.dest('./app/renderhtml/'));
	gulp.src(['./app/tutorials/*.html', '!./app/node_modules/**'])
		.pipe(inject(gulp.src(injects, {read: false}), {relative: true}))
		.pipe(gulp.dest('./app/tutorials'));
	filename = './app/renderjs/viewer.js';
	injects.push(filename);
	gulp.src(['./app/renderhtml/viewer.html', '!./app/node_modules/**'])
		.pipe(inject(gulp.src(injects, {read: false}), {relative: true}))
		.pipe(gulp.dest('./app/renderhtml'));
});

gulp.task('build:packCI', cb => {
	builder.build({
		platform: process.platform,
		arch: 'x64',
		config: {
			appId: 'com.willyb321.media_mate',
			nsis: {
				oneClick: false,
				allowToChangeInstallationDirectory: true
			},
			mac: {
				category: 'public.app-category.entertainment',
				target: 'dmg'
			},
			win: {
				target: [
					'dir'
				],
				publish: [
					'github'
				]
			}
		}
	})
		.then(() => {
			console.log('Built the app in dist/');
			cb();
		})
		.catch(err => {
			console.error(err);
		});
});
gulp.task('changelog', cb => {
	let githubChanges = spawn(require('path').join('node_modules', '.bin', 'github-changes') + (process.platform === 'win32' ? '.cmd' : ''), ['-o', 'willyb321', '-r', 'media_mate', '-b', 'develop', '--use-commit-body', '-k', `${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`]);
	githubChanges.stdout.on('data', (data) => {
		console.log(`stdout: ${data}`);
	});

	githubChanges.stderr.on('data', (data) => {
		console.log(`stderr: ${data}`);
	});

	githubChanges.on('close', (code) => {
		console.log(`github-changes exited with code ${code}`);
		cb();
	});
});
