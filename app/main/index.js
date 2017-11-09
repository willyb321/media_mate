/* eslint-disable no-undef */
/**
 * @author William Blythe
 * @fileoverview The main file. Entry point.
 */
/**
 * @module Index
 */
'use strict';
/* eslint-disable no-unused-vars */
console.time('full');
console.time('init');
console.time('require');
require('dotenv').config({path: `${__dirname}/../.env`});
console.time('electron');
import {dialog, BrowserWindow, Notification, ipcMain as ipc, session, app} from 'electron';
console.timeEnd('electron');
console.time('logger');
import log from 'electron-log';
console.timeEnd('logger');
console.time('updater');
import {autoUpdater} from 'electron-updater';
console.timeEnd('updater');
console.time('sentry');
import Raven from 'raven';
console.timeEnd('sentry');
console.time('rssparse');
import {RSSParse} from '../lib/rssparse';
console.timeEnd('rssparse');
console.time('menu');
import {init} from './menu.js';
console.timeEnd('menu');
console.time('underscore');
import _ from 'underscore';
console.timeEnd('underscore');
console.time('jsonstorage');
import storage from 'electron-json-storage';
console.timeEnd('jsonstorage');
console.time('bypass');
import {addBypassChecker} from 'electron-compile';
console.timeEnd('bypass');
console.time('electron-collection');
import {debug, firstRun, isDev, rootPath} from 'electron-collection';
console.timeEnd('electron-collection');
console.time('windowstate');
import windowStateKeeper from 'electron-window-state';
console.timeEnd('windowstate');
console.time('path');
import path from 'path';
console.timeEnd('path');
console.time('utils');
import {createDB, isPlayable} from '../lib/utils';
console.timeEnd('utils');
console.time('pkg');
const pkg = require(path.join(rootPath.path, 'package.json'));
console.timeEnd('pkg');
console.timeEnd('require');
console.time('unhandled');
require('electron-unhandled')();
console.timeEnd('unhandled');

let RSS;
/**
 * App version
 * @type {string}
 */
const version = app.getVersion();

Raven.config('https://3d1b1821b4c84725a3968fcb79f49ea1:1ec6e95026654dddb578cf1555a2b6eb@sentry.io/184666', {
	release: version,
	autoBreadcrumbs: false
}).install();
process.on('uncaughtError', err => {
	log.error('ERROR! The error is: ' + err || err.stack);
	Raven.captureException(err);
});

process.on('unhandledRejection', err => {
	log.error('Unhandled rejection: ' + (err && err.stack || err)); // eslint-disable-line
	Raven.captureException(err);
});
let updateInfo;
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
let win;
let db;
createDB(path.join(app.getPath('userData'), 'dbTor.db').toString())
	.then(dbCreated => {
		db = dbCreated;
	});

// Bypass compiling videos because thats a bad idea.
addBypassChecker(filePath => {
	if (isPlayable(filePath)) {
		log.info(`Bypassing ${filePath}`);
	}
	return isPlayable(filePath);
});

if (process.env.SPECTRON) {
	/**
	 * If Spectron is running, mock showOpenDialog to return the test folder.
	 * @param opts {object} Options showOpenDialog was called with.
	 * @param cb {function} An array of file paths returned.
	 */
	dialog.showOpenDialog = (opts, cb) => {
		cb([require('path').join(require('os').tmpdir(), 'MediaMateTest', 'Downloads')]);
	};
}

/**
 * Send release notes to renderer.
 */
ipc.on('releaseLoaded', event => {
	event.returnValue = {notes: updateInfo.releaseNotes, version: updateInfo.version};
});

/**
 * Autoupdater on update available
 */
autoUpdater.on('update-available', info => { // eslint-disable-line no-unused-vars
	log.info('Updater: Update available, info follows');
	log.info(info);
	updateInfo = info;
	win.loadURL(`file://${__dirname}/../renderhtml/releasenotes.html`);
	dialog.showMessageBox({
		type: 'info',
		buttons: [],
		title: 'New update available.',
		message: 'Press OK to download the update, and the application will download the update and then tell you when its done.'
	});
});

/**
 * Autoupdater on downloaded
 */
autoUpdater.on('update-downloaded', (event, info) => { // eslint-disable-line no-unused-vars
	const dialogOpts = {
		type: 'info',
		buttons: ['Restart', 'Later'],
		title: 'Media Mate Update Downloaded',
		message: `New Media Mate version!`,
		detail: 'A new version has been downloaded. Restart the application to apply the updates.'
	};
	log.info('Updater: Update downloaded, info follows');
	log.info(event);
	log.info(info);
	dialog.showMessageBox(dialogOpts, response => {
		if (response === 0) {
			autoUpdater.quitAndInstall();
		}
	});
});

/**
 * Autoupdater if error
 */
autoUpdater.on('error', error => {
	dialog.showMessageBox({
		type: 'info',
		buttons: [],
		title: 'Update error!',
		message: `Sorry, we've had an error. Please open an issue on github if this continues to be a problem!`
	});
	if (!isDev) {
		Raven.captureException(error);
	}
});

/**
 * Emitted on autoupdate progress.
 */
autoUpdater.on('download-progress', percent => {
	log.info(`Update ${percent.percent}% downloaded`);
	win.setProgressBar(percent.percent);
});

// Adds debug features like hotkeys for triggering dev tools and reload
if (isDev && process.env.NODE_ENV !== 'test') {
	debug({showDevTools: true});
}

// Prevent window being garbage collected
let mainWindow;
/**
 * Catch any uncaught errors and report them.
 * @param err {object} - The error to be handled.
 */
process.on('uncaughtError', err => {
	log.error('ERROR! The error is: ' + err || err.stack);
	Raven.captureException(err);
});

/**
 * Same as process.on('uncaughtError') but for promises.
 */
process.on('unhandledRejection', err => {
	console.error('Unhandled rejection: ' + (err && err.stack || err)); // eslint-disable-line
	Raven.captureException(err);
});

/**
 * Dereference the window to make sure that things are collected properly.
 */
function onClosed() {
	// Dereference the window
	// for multiple windows store them in an array
	mainWindow = null;
}

/**
 * Make the window, get the state, then return.
 * @returns {*}
 */
function createMainWindow() {
	if (process.env.SPECTRON) {
		win = new BrowserWindow({
			width: 1280,
			height: 720,
			useContentSize: true,
			isMaximized: false,
			backgroundColor: '#f8f9fa'
		});
	} else {
		const mainWindowState = windowStateKeeper({
			isMaximized: false,
			useContentSize: true,
			defaultWidth: 1280,
			defaultHeight: 720
		});
		win = new BrowserWindow({
			x: mainWindowState.x,
			y: mainWindowState.y,
			width: mainWindowState.width,
			height: mainWindowState.height,
			show: false,
			backgroundColor: '#f8f9fa'
		});
		mainWindowState.manage(win);
	}
	win.loadURL(`file://${__dirname}/../renderhtml/index.html`);
	win.on('closed', onClosed);
	win.on('unresponsive', () => {
		log.info('I\'ve frozen. Sorry about that.');
	});
	win.on('responsive', () => {
		log.info('I\'ve unfrozen. Sorry.');
	});
	win.webContents.once('dom-ready', () => {
		console.timeEnd('full');
	});
	win.webContents.on('gpu-process-crashed', event => {
		console.log(event);
	});
	win.webContents.on('did-finish-load', () => {
		win.webContents.executeJavaScript('require(\'electron-unhandled\')()');
	});
	win.webContents.on('plugin-crashed', event => {
		console.log(event);
	});
	win.webContents.on('crashed', (event, killed) => {
		if (killed === true) {
			log.error(event);
			mainWindow = null;
			if (process.platform === 'darwin') {
				app.quit();
			}
		} else {
			log.error('Browser process crashed. Not sure how or why because there doesn\'t seem to be a good stack trace');
			Raven.captureException(new Error('Browser process crashed. Not sure how or why because there doesn\'t seem to be a good stack trace'));
		}
	});
	win.once('ready-to-show', () => {
		win.show();
	});
	return win;
}

/**
 * Initialise Origin headers to make sentry works.
 */
function setupSentryHeaders() {
	session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
		details.requestHeaders.Origin = 'mediamate.williamblythe.info'; // Set the Origin to whatever you want.
		callback({cancel: false, requestHeaders: details.requestHeaders});
	});
}

/**
 * Ask the user if they want to view the tutorial on first run
 */
function onBoard() {
	if (firstRun({
		name: pkg.name
	})) {
		storage.has('path', (err, hasKey) => {
			if (err) {
				Raven.captureException(err);
			} else if (!hasKey) {
				storage.set('path', {
					path: path.join(require('os').homedir(), 'media_matedl')
				}, err => {
					if (err) {
						log.info('MAIN: Error in onBoard (storage.set)');
						Raven.captureException(err);
					}
				});
			}
		});
		mainWindow.webContents.once('dom-ready', () => {
			mainWindow.webContents.executeJavaScript('firstrun()');
		});
		storage.get('firstrun', (err, data) => {
			if (err) {
				Raven.captureException(err);
			}
			if (_.isEmpty(data)) {
				storage.set('firstrun', {first: false}, err => {
					if (err) {
						Raven.captureException(err);
					}
				});
			}
		});
	}
}

/**
 * When all windows are closed, quit the app.
 */
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
	RSS = null;
});

/**
 * If mainwindow doesn't exist, make it.
 */
app.on('activate', () => {
	if (!mainWindow) {
		mainWindow = createMainWindow();
	}
});

/**
 * @description Make sure to not add torrents that are already in the database / downloaded
 * @param torrent {object} - the torrent object to be checked
 * @param callback {function} - The callback.
 */
async function ignoreDupeTorrents(torrent, callback) {
	db.find({_id: torrent.link}, (err, docs) => {
		if (err) {
			Raven.context(() => {
				Raven.captureBreadcrumb({
					data:
					{
						torrent: torrent.link,
						docs
					}
				});
				Raven.captureException(err);
			});
		}
		if (_.isEmpty(docs)) {
			db.insert({
				_id: torrent.link,
				magnet: torrent.link,
				title: torrent.title,
				tvdbID: torrent['tv:show_name']['#'],
				airdate: torrent.pubDate,
				downloaded: false
			});
			callback();
		} else {
			_.each(docs, doc => {
				if (doc.downloaded === true && doc._id === torrent.link) {
					callback('dupe');
				} else {
					callback();
				}
			});
		}
	});
}

/**
 * @description Get the ShowRSS URI from the DB.
 * @param callback {function} Callbacks
 */
function getRSSURI(callback) {
	storage.get('showRSS', (err, data) => {
		if (err) {
			Raven.captureException(err);
		}
		if (_.isEmpty(data) === false) {
			callback(data.showRSSURI);
		} else {
			callback('');
		}
	});
}

/**
 * @description Watch the ShowRSS feed for new releases, and notify user when there is one.
 */
function watchRSS() {
	let uri;
	getRSSURI(cb => {
		uri = cb;
		if (cb === '') {
			if (win.webContents.isLoading()) {
				mainWindow.webContents.once('dom-ready', () => {
					new Notification({
						title: 'Put your ShowRSS URL into the downloader!',
						body: 'showrss.info',
						icon: path.join(__dirname, '..', 'renderhtml', 'notificon.png')
					}).show();
				});
			} else {
				new Notification({
					title: 'Put your ShowRSS URL into the downloader!',
					body: 'showrss.info',
					icon: path.join(__dirname, '..', 'renderhtml', 'notificon.png')
				}).show();
			}
		} else {
			RSS = new RSSParse(uri);
			RSS.on('error', err => {
				Raven.captureException(err);
			});
			RSS.on('offline', () => {
				if (mainWindow.webContents.isLoading()) {
					log.info('Offline');
					mainWindow.webContents.once('dom-ready', () => {
						mainWindow.webContents.send('offline');
					});
				} else {
					mainWindow.webContents.send('offline');
				}
			});
			RSS.on('data', data => {
				ignoreDupeTorrents(data, dupe => {
					if (dupe) {
						log.info('MAIN: Torrent already DL');
					} else if (win.webContents.isLoading()) {
						mainWindow.webContents.once('dom-ready', () => {
							new Notification({
								title: 'New Download Available!',
								body: data.title.toString(),
								icon: path.join(__dirname, '..', 'renderhtml', 'notificon.png')
							}).show();
						});
					} else {
						new Notification({
							title: 'New Download Available!',
							body: data.title.toString(),
							icon: path.join(__dirname, '..', 'renderhtml', 'notificon.png')
						}).show();
					}
				});
			});
		}
	});
}

/**
 * Sent from render process on a download finishes. Sends a notification
 */
ipc.on('dldone', (event, data) => {
	log.info('MAIN: Download done - ' + data.toString());
	new Notification({
		title: 'Download Finished!',
		body: data.toString(),
		icon: path.join(__dirname, '..', 'renderhtml', 'notificon.png')
	}).show();
});

/**
 * Make the main window.
 */
app.on('ready', () => {
	mainWindow = createMainWindow();
	if (process.env.NODE_ENV === 'development') {
		mainWindow.webContents.openDevTools();
	}
	init();
	setupSentryHeaders();
	watchRSS();
	onBoard();
	if (!isDev && process.env.NODE_ENV !== 'test' && process.platform !== 'darwin' && process.platform !== 'linux') {
		autoUpdater.checkForUpdates();
	}
	console.timeEnd('init');
});
