/**
 * @author William Blythe
 * @fileoverview File that handles downloading of shows
 */
/**
 * @module Downloader
 */
/* eslint-disable no-unused-vars */
/* eslint-disable max-nested-callbacks */
require('dotenv').config({
	path: `${__dirname}/.env`
});
const {dialog} = require('electron').remote;
const path = require('path');
const Raven = require('raven');
const ipc = require('electron').ipcRenderer;
require('events').EventEmitter.prototype._maxListeners = 1000;
const moment = require('moment');
const log = require('electron-log');
console.log = log.info;
const swal = require('sweetalert2');
const RSSParse = require(`${__dirname}/../lib/rssparse.js`).RSSParse;
const ProgressBar = require('progressbar.js');
const _ = require('underscore');
const bytes = require('bytes');
const storage = require('electron-json-storage');
const Datastore = require('nedb-core');
const WebTorrent = require('webtorrent');
const {createDB} = require('../lib/utils');
const rssTor = [];
let dupeCount = 0;
const version = require('electron').remote.app.getVersion();
Raven.config('https://3d1b1821b4c84725a3968fcb79f49ea1:1ec6e95026654dddb578cf1555a2b6eb@sentry.io/184666', {
	release: version,
	autoBreadcrumbs: true
}).install();
const client = new WebTorrent();
let i = 0;
let bar;
let db;
createDB(path.join(require('electron').remote.app.getPath('userData'), 'dbTor.db').toString())
	.then(dbCreated => {
		db = dbCreated;
	});
const dbindex = 0;
const allTorrents = [];
const prog = _.throttle(dlProgress, 10000);
const updateDlProg = _.throttle(updateProgress, 2000);

process.on('unhandledRejection', (err, promise) => {
	console.error('Unhandled rejection: ' + (err && err.stack || err)); // eslint-disable-line
	Raven.captureException(err);
});

function handleErrs(err) {
	console.error('Unhandled error: ' + (err && err.stack || err)); // eslint-disable-line
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
	animateThrottled(client.progress);
}
/**
 * Get the confirm button for the currently active sweetalert
 * @return {Promise} Rejects if no sweetalert on screen, resolves the confirm button DOM element if a sweetalert is currently active
 */
function getSwalConfirmButton() {
	return new Promise((resolve, reject) => {
		if (swal.getConfirmButton) {
			let res = swal.getConfirmButton();
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
			console.log(err);
		}
		if (docs.length > 0) {
			if (docs[0].downloaded === true) {
				callback('dupe');
			} else if (docs[0].downloaded === false) {
				callback();
			}
		} else {
			db.insert({
				_id: torrent.link,
				magnet: torrent.link,
				title: torrent.title,
				tvdbID: torrent['tv:show_name']['#'],
				airdate: torrent['rss:pubdate']['#'],
				downloaded: false
			});
			callback();
		}
	});
}
/**
 * Drop the torrent database. Mainly for testing purpose.
 * @param callback - let em know.
 */
async function dropTorrents(callback) {
	db.remove({}, {multi: true}, (err, numRemoved) => {
		if (err) {
			console.log(err);
		}
		console.log(numRemoved);
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
			throw err;
		}
	});
}
/**
 * Initial load, get the torrents in the db.
 */
async function findDocuments() {
	db.find({}, (err, docs) => {
		if (err) {
			console.log(err);
		}
		_.each(docs, elem => allTorrents.push(elem.magnet));
	});
}

async function indexDB() {
	db.ensureIndex({
		fieldName: '_id'
	}, err => {
		if (err) {
			console.log(err);
		}
	});
	db.ensureIndex({
		fieldName: 'magnet'
	}, err => {
		if (err) {
			console.log(err);
		}
	});
	db.ensureIndex({
		fieldName: 'downloaded'
	}, err => {
		if (err) {
			console.log(err);
		}
	});
}

/**
 * Download all of the torrents, after they are added to the DOM.
 */
async function dlAll() {
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
	dialog.showOpenDialog({
		properties: ['openDirectory']
	}, dlpath => {
		if (dlpath !== undefined) {
			console.log(dlpath[0]);
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
			torrent.index = index;
			try {
				const elem = document.getElementsByName(magnet)[0];
				if (elem) {
					elem.checked = true;
					elem.disabled = true;
				}
			} catch (err) {
				console.error(err);
			}

			torrent.on('download', () => {
				prog(torrent, magnet);
				updateDlProg(magnet, torrent);
			});
			torrent.on('done', async () => {
				dlProgress();
				db.update({_id: document.getElementsByName(magnet)[0].name}, {
					$set: {
						downloaded: true
					}
				}, (err, numReplaced) => {
					if (err) {
						console.log(err);
					}
					document.getElementsByName(magnet)[0].parentNode.style.display = 'none';
					console.log('done');
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
			if (process.env.NODE_ENV === 'test' && process.env.SPECTRON === '1') {
				label.innerText = `${data.title} - (${moment(data.pubdate).from(moment.unix(1503474469))}) `;
			}
			label.innerText = `${data.title} - (${moment(data.pubdate).fromNow()}) `;
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
			dlbox.appendChild(document.createElement('br'));
			document.getElementById('dlbox').appendChild(label);
			document.getElementById('dlAll').style.display = 'block';
			i++;
		} else if (dupe) {
			console.log('dupe');
			dupeCount++;
			console.log(dupeCount);
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
			Raven.captureException(err);
		});
		RSS.on('offline', online => {
			swal('Offline', 'You are offline, thats fine though.', 'info');
		});
		RSS.on('error', err => {
			console.log(err);
			tb.disabled = false;
			document.getElementById('dupecount').disabled = false;
		});
		// Emitted every time a new RSS item appears.
		RSS.on('data', data => {
			data = _.omit(data, '_id');
			rssTor.push(data);
			processTorrents(data);
		});
		return false;
	}
}
