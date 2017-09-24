/**
 * @author William Blythe
 * @fileoverview The class that gets TVDB info from files
 */
/**
 * @module Get-Images
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

class GetImgs extends events.EventEmitter {
	constructor(directory, nedb) {
		super();
		db = nedb;
		this.tvdbInit(directory);
	}

	async tvdbInit(directory) {
		const files = await this.findFiles(directory);
		for (let i = 0; i < files.files.length; i++) {
			setTimeout(() => {
				this._loop(files.files[i]);
			}, 1000);
		}
	}
	_loop(currentFile) {
		let elem = currentFile;
		log.info(`VIEWER: getting image for: ${elem}`);
		if (elem !== undefined) {
			const elempath = elem.replace(/^.*[\\/]/, '');
			const tvelem = parser(elempath);
			this.hasShow(tvelem, elempath, elem);
		}
	}
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
