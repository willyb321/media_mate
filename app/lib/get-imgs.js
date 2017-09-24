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
			log.info(`VIEWER: Getting image for ${files.files[i]}`);
			this._loop(files.files[i]);
		}
	}
	_loop(currentFile) {
		let elem = currentFile;
		console.log(elem);
		if (elem !== undefined) {
			elem = elem.replace(/^.*[\\/]/, '');
			const elempath = elem;
			const tvelem = parser(elem);
			this.hasShow(tvelem, elempath);
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
				console.log(files);
				resolve({files});
			});
		});
	}
	async hasShow(tvelem, elempath) {
		if (_.has(tvelem, 'show') === true) {
			const already = await this.inDB(tvelem);
			if (already === 'got image') {
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
				console.log(tvelem.show);
				this.getEpisodes(res, tvelem, elempath);
			})
			.catch(err => {
				if (err.message === 'Resource not found') {
					setImmediate(() => this._loop());
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
				if (err.message === 'Resource not found') {
					setImmediate(() => this._loop());
				} else {
					Raven.captureException(err);
				}
			});
	}
	findRightEp(episodes, tvelem, elempath) {
		episodes.forEach(elem => {
			if (_.isMatch(elem, {airedEpisodeNumber: tvelem.episode}) === true && _.isMatch(elem, {airedSeason: tvelem.season}) === true) {
				this.emit('episode', [elem, tvelem, elempath]);
			}
		});
	}
}
module.exports = {
	GetImgs
};
