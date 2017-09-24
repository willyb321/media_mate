/**
 * @author William Blythe
 * @fileoverview The class that gets TVDB info from files
 */
/* eslint-disable no-unused-vars */
/* eslint-disable max-nested-callbacks */
require('dotenv').config({path: `${__dirname}/../.env`});
const events = require('events');
let Raven;
const isRenderer = require('is-electron-renderer');
const TVDB = require('node-tvdb');
const parser = require('episode-parser');
const log = require('electron-log');
const dir = require('node-dir');
const _ = require('underscore');
const path = require('path');
const {isPlayable} = require(path.join(__dirname, 'utils.js'));
const tvdb = new TVDB(process.env.TVDB_KEY);
let db;
let version;
console.log = log.info;

process.on('uncaughtError', err => {
	log.error('ERROR! The error is: ' + err || err.stack);
	Raven.captureException(err);
});

process.on('unhandledRejection', err => {
	log.error('Unhandled rejection: ' + (err && err.stack || err)); // eslint-disable-line
	Raven.captureException(err);
});

// Make sure that version can be got from both render and main process
if (isRenderer) {
	version = require('electron').remote.app.getVersion();
	Raven = require('raven-js');
	Raven.config('https://3d1b1821b4c84725a3968fcb79f49ea1@sentry.io/184666', {
		release: version,
		autoBreadcrumbs: true
	}).install();
} else {
	version = require('electron').app.getVersion();
	Raven = require('raven');
	Raven.config('https://3d1b1821b4c84725a3968fcb79f49ea1:1ec6e95026654dddb578cf1555a2b6eb@sentry.io/184666', {
		release: version,
		autoBreadcrumbs: true
	}).install();
}

/**
 * Class for getting images from files in the download directory
 */
class GetImgs extends events.EventEmitter {
	/**
	 * The constructor for {@link GetImgs}
	 * @param {string} directory - a string with path to downloaded files
	 * @param {object} nedb - The NeDB instance
	 */
	constructor(directory, nedb) {
		super();
		db = nedb;
		this.tvdbInit(directory);
	}

	/**
	 * Loop through each file in directory and initiate {@link GetImgs#loop}.
	 * @param {string} directory - Path to download directory.
	 */
	async tvdbInit(directory) {
		const files = await this.findFiles(directory);
		for (let i = 0; i < files.files.length; i++) {
			setTimeout(() => {
				this.loop(files.files[i]);
			}, 1000);
		}
	}

	/**
	 * Strips path from filename, parses it, continues to {@link GetImgs#hasShow}.
	 * @param {string} currentFile - Path to current file that we are getting images for.
	 */
	loop(currentFile) {
		let elem = currentFile;
		log.info(`VIEWER: getting image for: ${elem}`);
		if (elem !== undefined) {
			const elempath = elem.replace(/^.*[\\/]/, '');
			const tvelem = parser(elempath);
			this.hasShow(tvelem, elempath, elem);
		}
	}

	/**
	 * Returns object with all files from directory param in an array.
	 * @param {string} directory - Path to files.
	 * @returns {Promise.<Object>}
	 */
	findFiles(directory) {
		return new Promise(resolve => {
			dir.files(directory, (err, files) => {
				if (err) {
					Raven.captureException(err);
				}
				files.sort();
				files = _.filter(files, isPlayable);
				resolve({files});
			});
		});
	}

	/**
	 * Check if the parsed filename has the needed information in it.
	 * @param {object} tvelem - Parsed filename usually containing things like show, episode, season etc.
	 * @param {string} elempath - Filename without path (includes extension).
	 * @param {string} elem - Full path to file.
	 */
	async hasShow(tvelem, elempath, elem) {
		if (_.has(tvelem, 'show') === true) {
			const already = await this.inDB(tvelem);
			if (already === 'got image') {
				log.info(`VIEWER: got image from DB for: ${elem}`);
				this.emit('tvelem', [tvelem, elempath]);
			} else if (already === 'need image') {
				this.getSeriesByName(tvelem, elempath);
			}
		}
	}

	/**
	 * Check if there is already an image for an episode in the DB.
	 * @param {object} tvelem - Parsed filename usually containing things like show, episode, season etc.
	 * @returns {Promise.<String>} - 'need image' if needing image, 'got image' if already in DB.
	 */
	inDB(tvelem) {
		return new Promise(resolve => {
			db.find({_id: `img${tvelem.show.replace(' ', '')}S${tvelem.season}E${tvelem.episode}`}, (err, docs) => {
				if (err) {
					Raven.captureException(err);
				}
				if (docs.length === 0) {
					resolve('need image');
				} else if (docs[0].imgData) {
					resolve('got image');
				}
			});
		});
	}

	/**
	 * Looks up a series on The TVDB, and gets info about it.
	 * Calls {@link GetImgs#getEpisodes} if it finds a series.
	 * Emits a notfound event if it doesn't find the series.
	 * @param {object} tvelem - Parsed filename usually containing things like show, episode, season etc.
	 * @param {string} elempath - Filename without path (includes extension).
	 */
	getSeriesByName(tvelem, elempath) {
		tvdb.getSeriesByName(tvelem.show)
			.then(res => {
				log.info(`VIEWER: Got series of name: ${tvelem.show}`);
				this.getEpisodes(res, tvelem, elempath);
			})
			.catch(err => {
				log.error(err);
				if (err.message === 'Resource not found') {
					log.info(`VIEWER: Did not find series: ${tvelem.show}`);
					this.emit('notfound', {tvelem, elempath});
				} else {
					Raven.captureException(err);
				}
			});
	}

	/**
	 * Gets all episodes from a TVDB series ID
	 * Emits a notfound event if no episodes are found for the series ID. Probably unlikely, but happens.
	 * Calls {@link GetImgs#findRightEp} with all episodes.
	 * @param {object} series - Information from The TVDB API about the series currently being processed.
	 * @param {object} tvelem - Parsed filename usually containing things like show, episode, season etc.
	 * @param {string} elempath - Filename without path (includes extension).
	 */
	getEpisodes(series, tvelem, elempath) {
		tvdb.getEpisodesBySeriesId(series[0].id)
			.then(res => {
				this.findRightEp(res, tvelem, elempath);
			})
			.catch(err => {
				log.error(err);
				if (err.message === 'Resource not found') {
					log.info(`VIEWER: Did not find episodes from series of name: ${tvelem.show}`);
					this.emit('notfound', {tvelem, elempath});
				} else {
					Raven.captureException(err);
				}
			});
	}

	/**
	 * Loops through all episodes found from The TVDB, checking if they match the episode we want.
	 * We check the episode number and season.
	 * Emits an episode event if it finds an episode, and a notfound event if it doesn't.
	 * @param {object} episodes - Information from The TVDB API about the episodes currently being processed.
	 * @param {object} tvelem - Parsed filename usually containing things like show, episode, season etc.
	 * @param {string} elempath - Filename without path (includes extension).
	 */
	findRightEp(episodes, tvelem, elempath) {
		let found = false;
		episodes.forEach((elem, ind) => {
			if (_.isMatch(elem, {airedEpisodeNumber: tvelem.episode}) === true && _.isMatch(elem, {airedSeason: tvelem.season}) === true) {
				found = true;
				this.emit('episode', [elem, tvelem, elempath]);
			}
			if (ind === episodes.length - 1 && !found) {
				log.info(`VIEWER: Did not find S${tvelem.season}E${tvelem.episode} from ${tvelem.show}`);
				this.emit('notfound', {tvelem, elempath});
			}
		});
	}
}
module.exports = {
	GetImgs
};
