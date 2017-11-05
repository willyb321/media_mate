/**
 * @author William Blythe
 * @fileoverview File that handles downloading of shows
 */
/**
 * @module Downloader
 */
/* eslint-disable no-unused-vars */
/* eslint-disable max-nested-callbacks */
import 'source-map-support/register';
import {remote, ipcRenderer as ipc} from 'electron';
import path from 'path';
import Raven from 'raven-js';
import moment from 'moment';
import log from 'electron-log';
import swal from 'sweetalert2';
import ProgressBar from 'progressbar.js';
import _ from 'underscore';
import bytes from 'bytes';
import storage from 'electron-json-storage';
import WebTorrent from 'webtorrent';
import {createDB} from '../lib/utils';
import {RSSParse} from '../lib/rssparse.js';

require('dotenv').config({
	path: `${__dirname}/.env`
});
require('events').EventEmitter.prototype._maxListeners = 1000;

const rssTor = [];
let dupeCount = 0;
const version = remote.app.getVersion();
Raven.config('https://3d1b1821b4c84725a3968fcb79f49ea1@sentry.io/184666', {
	release: version,
	autoBreadcrumbs: true
}).install();
const client = new WebTorrent();
let i = 0;
let bar;
let db;
createDB(path.join(remote.app.getPath('userData'), 'dbTor.db').toString())
	.then(dbCreated => {
		db = dbCreated;
	});

const allTorrents = [];
const prog = _.throttle(dlProgress, 4500);
const updateDlProg = _.throttle(updateProgress, 2000);

process.on('unhandledRejection', (err, promise) => {
	log.error('Unhandled rejection: ' + (err && err.stack || err)); // eslint-disable-line
	Raven.captureException(err);
});

function handleErrs(err) {
	log.error('Unhandled error: ' + (err && err.stack || err)); // eslint-disable-line
	Raven.captureException(err);
}

/**
 * Make sure that everything is loaded before doing the good stuff.
 */
window.onload = () => {
	findDocuments();
	indexDB();
	getRSSURI(callback => {
		document.getElementById('rss').value = callback;
	});
	bar = new ProgressBar.Line('#Progress', {
		strokeWidth: 4,
		easing: 'easeInOut',
		duration: 1400,
		color: '#FFEA82',
		trailColor: '#eee',
		trailWidth: 1,
		svgStyle: {
			width: '100%',
			height: '100%'
		},
		text: {
			style: {
				// Text color.
				// Default: same as stroke color (options.color)
				color: '#999',
				position: 'absolute',
				right: '0',
				//				Top: '30px',
				padding: 0,
				margin: 0,
				transform: null
			},
			autoStyleContainer: false
		},
		from: {
			color: '#FFEA82'
		},
		to: {
			color: '#ED6A5A'
		},
		step: (state, bar) => {
			bar.setText(Math.round(bar.value() * 100) + ' %');
		}
	});
};
/**
 * Update the download progress bar, but make sure not to do it too often.
 */
function dlProgress() {
	const animateThrottled = _.throttle(
		_.bind(bar.animate, bar),
		500
	);
	const progress = client.progress;
	if (progress === 0 && client.torrents.length === 0) {
		log.info(`DOWNLOADER: Downloads finished`);
	}
	animateThrottled(progress);
}
/**
 * Get the confirm button for the currently active sweetalert
 * @return {Promise} Rejects if no sweetalert on screen, resolves the confirm button DOM element if a sweetalert is currently active
 */
function getSwalConfirmButton() {
	return new Promise((resolve, reject) => {
		if (swal.getConfirmButton) {
			const res = swal.getConfirmButton();
			if (res) {
				resolve(res);
			}
		}
		reject(new Error('No swal found'));
	});
}

/**
 * WebTorrent on error, handle it.
 */
client.on('error', err => {
	handleErrs(err);
});
/**
 * Get the ShowRSS URI from JSON storage
 * @param callback - return it.
 */
function getRSSURI(callback) {
	storage.get('showRSS', (err, data) => {
		if (err) {
			handleErrs(err);
		}
		if (_.isEmpty(data) === false) {
			callback(data.showRSSURI);
		} else {
			callback('');
		}
	});
}
/**
 * Make sure not to add torrents already downloaded.
 * @param torrent {object} - the torrent object to be checked
 * @param callback - You know what it is.
 */
async function ignoreDupeTorrents(torrent, callback) {
	db.find({
		_id: torrent.link
	}, (err, docs) => {
		if (err) {
			log.info('DOWNLOADER: Error in ignoreDupeTorrents (db.find)');
			Raven.captureException(err);
		}
		if (docs.length > 0) {
			if (docs[0].downloaded === true) {
				callback('dupe');
			} else if (docs[0].downloaded === false) {
				callback();
			}
		} else {
			Raven.context(() => {
				Raven.captureBreadcrumb({
					data: {
						torrent
					}
				});
				db.insert({
					_id: torrent.link,
					magnet: torrent.link,
					title: torrent.title,
					tvdbID: torrent['tv:show_name']['#'],
					airdate: torrent['rss:pubdate']['#'],
					downloaded: false
				});
				callback();
			});
		}
	});
}
/**
 * Drop the torrent database. Mainly for testing purpose.
 */
async function dropTorrents() {
	db.remove({}, {multi: true}, (err, numRemoved) => {
		if (err) {
			log.info('DOWNLOADER: Error in dropTorrents (db.remove)');
			Raven.captureException(err);
		}
		log.info(`DOWNLOADER: Removed ${numRemoved} from DB`);
	});
}
/**
 * Make sure that the ShowRSS URI is updated.
 * @param uri {string} - the ShowRSS URI
 */
function updateURI(uri) {
	storage.set('showRSS', {
		showRSSURI: uri
	}, err => {
		if (err) {
			log.info(`DOWNLOADER: Error in updateURI (storage.set)`);
			Raven.captureException(err);
		}
	});
}
/**
 * Initial load, get the torrents in the db.
 */
async function findDocuments() {
	db.find({}, (err, docs) => {
		if (err) {
			log.info('DOWNLOADER: Error in findDocuments');
			Raven.captureException(err);
		}
		_.each(docs, elem => allTorrents.push(elem.magnet));
	});
}
/**
 * Index the database.
 */
async function indexDB() {
	db.ensureIndex({
		fieldName: '_id'
	}, err => {
		if (err) {
			log.info('DOWNLOADER: Error in indexDB (ensureIndex on _id)');
			Raven.captureException(err);
		}
	});
	db.ensureIndex({
		fieldName: 'magnet'
	}, err => {
		if (err) {
			log.info('DOWNLOADER: Error in indexDB (ensureIndex on magnet)');
			Raven.captureException(err);
		}
	});
	db.ensureIndex({
		fieldName: 'downloaded'
	}, err => {
		if (err) {
			log.info('DOWNLOADER: Error in indexDB (ensureIndex on downloaded)');
			Raven.captureException(err);
		}
	});
}

/**
 * Download all of the torrents, after they are added to the DOM.
 */
async function dlAll() {
	for (const i of document.querySelectorAll('label > input[type="checkbox"]')) {
		i.disabled = true;
	}
	document.getElementById('dlAll').disabled = true;
	db.find({
		downloaded: false
	}, (err, docs) => {
		if (err) {
			Raven.captureException(err);
		}
		_.each(docs, (elem, index) => {
			addTor(elem.magnet, index);
		});
	});
}
/**
 * Get the path for torrents to be downloaded to, from JSON storage.
 * @param callback
 */
function getDlPath(callback) {
	storage.get('path', (err, data) => {
		if (err) {
			handleErrs(err);
		}
		if (_.isEmpty(data) === false) {
			callback(data.path);
		} else {
			callback('');
		}
	});
}
/**
 * Insert the download path to electron-json-storage
 * @param callback - callback, obviously
 */
function insertDlPath(callback) {
	const tb = document.getElementById('dlpath');
	remote.dialog.showOpenDialog({
		properties: ['openDirectory']
	}, dlpath => {
		if (dlpath !== undefined) {
			log.info('DOWNLOADER: path to DL to: ' + dlpath[0]);
			storage.set('path', {
				path: dlpath[0]
			}, error => {
				if (error) {
					handleErrs(error);
				}
			});
		}
	});
}
/**
 * Update the download progress.
 * @param {string} magnet - The magnet URI for the download. Used to identify which DOM element to modify.
 * @param {any} torrent - The WebTorrent torrent instance.
 */
function updateProgress(magnet, torrent) {
	const percent = Math.round(torrent.progress * 100 * 100) / 100;
	const elem = document.getElementsByName(magnet)[0];
	if (elem) {
		elem.parentNode.childNodes[1].nodeValue = `- ${percent.toString()}% downloaded (${bytes.format(torrent.downloadSpeed)}/s) , ${moment.duration(torrent.timeRemaining / 1000, 'seconds').humanize()} remaining.`;
	}
}

/**
 * Add a torrent to WebTorrent and the DB.
 * @param magnet {string} - the magnet URI for WebTorrent
 * @param index {number} - the index of the torrent.
 */
function addTor(magnet, index) {
	document.getElementById('Progress').style.display = '';
	getDlPath(callback => {
		client.add(magnet, {
			path: callback
		}, torrent => {
			log.info(`DOWNLOADER: Started download for magnet URI: ${magnet}`);
			torrent.index = index;
			try {
				const elem = document.getElementsByName(magnet)[0];
				if (elem) {
					elem.checked = true;
					elem.disabled = true;
				}
			} catch (err) {
				log.info(`DOWNLOADER: Error in addTor (addTor disable elements)`);
				Raven.captureException(err);
			}

			torrent.on('download', () => {
				prog(torrent, magnet);
				updateDlProg(magnet, torrent);
			});
			torrent.on('done', () => {
				dlProgress();
				db.update({_id: document.getElementsByName(magnet)[0].name}, {
					$set: {
						downloaded: true
					}
				}, (err, numReplaced) => {
					if (err) {
						log.info(`DOWNLOADER: Error in addTor (.on(done))`);
						Raven.captureException(err);
					}
					document.getElementsByName(magnet)[0].parentNode.style.display = 'none';
					log.info('DOWNLOADER: Download done');
					log.info(`DOWNLOADER: Replaced ${numReplaced} in DB when finishing download.`);
					ipc.send('dldone', torrent.name);
					torrent.destroy();
				});
			});
		});
	});
}

/**
 * Function to process torrents from ShowRSS
 * @param {object} data
 */
function processTorrents(data) {
	const dlbox = document.getElementById('dlbox');
	ignoreDupeTorrents(data, dupe => {
		if (!dupe) {
			const br = document.createElement('br');
			const label = document.createElement('label');
			label.innerText = `${data.title} - (${moment(data.pubdate).fromNow()}) `;
			if (process.env.NODE_ENV === 'test' && process.env.SPECTRON === '1') {
				label.innerText = `${data.title} - (${moment(data.pubdate).from(moment.unix(1503474469))}) `;
			}
			const input = document.createElement('input');
			const dlprogTitle = document.createTextNode(' ');
			label.appendChild(dlprogTitle);
			label.id = i;
			input.type = 'checkbox';
			input.className = 'checkbox';
			input.name = data.link;
			input.addEventListener('click', () => {
				input.disabled = true;
				input.className = 'is-disabled';
				addTor(input.name, parseInt(input.id, 0));
			});
			label.appendChild(input);
			dlbox.appendChild(br);
			document.getElementById('dlbox').appendChild(label);
			document.getElementById('dlAll').style.display = 'block';
			i++;
		} else if (dupe) {
			log.info('DOWNLOADER: dupe torrent');
			dupeCount++;
			log.info(`DOWNLOADER: ${dupeCount} dupes`);
			document.getElementById('dupecount').style.display = '';
			document.getElementById('dupecount').textContent = `${dupeCount} dupes`;
		}
	});
}

/**
 * Called on hitting enter in the Magnet URI box.
 * @param e {object} - the keypress event.
 * @returns {boolean} - whether the key was enter or not.
 */
function runScript(e) {
	// Called from both a button and a textbox
	// so check for click / enter keypress before doing anything else.
	if (e.type === 'click' || e.charCode === 13) {
		const tb = document.getElementById('rss');
		tb.disabled = true;
		document.getElementById('dupecount').disabled = true;
		swal(
			'Getting your downloads',
			'Welcome to Media Mate',
			'success'
		);
		// Set the ShowRSS feed url in json storage.
		updateURI(tb.value);
		document.getElementById('dls').style.display = 'inline';
		const RSS = new RSSParse(tb.value);
		// Emitted on RSS error (invalid url etc).
		RSS.on('error', err => {
			Raven.context(() => {
				Raven.captureBreadcrumb({
					message: err.message,
					data: {
						rssURL: tb.value
					}
				});
				tb.disabled = false;
				document.getElementById('dupecount').disabled = false;
				Raven.captureException(err);
			});
		});
		RSS.on('offline', online => {
			swal('Offline', 'You are offline, thats fine though.', 'info');
		});
		// Emitted every time a new RSS item appears.
		RSS.on('data', data => {
			data = _.omit(data, '_id');
			rssTor.push(data);
			processTorrents(data);
		});
		RSS.on('finish', () => {
			setTimeout(() => {
				const howManyDls = document.getElementById('dlbox').childElementCount;
				if (howManyDls === 0) {
					const elem = document.getElementById('dlbox');
					const emptyElem = document.createElement('h1');
					emptyElem.className = 'title';
					log.info('DOWNLOADER: No downloads');
					emptyElem.innerText = `There is no new downloads!`;
					const emptySubtitle = document.createElement('h2');
					emptyElem.style['text-align'] = 'center';
					emptySubtitle.innerText = `Go to the viewer and do some viewing while you wait!`;
					emptySubtitle.className = 'subtitle';
					emptyElem.appendChild(emptySubtitle);
					elem.appendChild(emptyElem);
				}
			}, 1500);
		});
		return false;
	}
}
