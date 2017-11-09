/**
 * @module Utils
 */

const path = require('path');
const Datastore = require('nedb-core');
const http = require('http');
const parseUrl = require('parseurl');
const send = require('send');
let server;

/**
 * Return true if file is playable
 * @param file {string} - the filename with extension
 * @returns {boolean} - if its playable or not.
 */
function isPlayable(file) {
	return isVideo(file);
}

/**
 * Checks whether the file path is playable video
 * @param file {string} - the path to the file
 * @returns {boolean} true for playable, false for not.
 */
function isVideo(file) {
	return [
		'.avi',
		'.m4v',
		'.mkv',
		'.mov',
		'.mp4',
		'.mpg',
		'.ogv',
		'.webm',
		'.wmv'
	].includes(getFileExtension(file));
}

/**
 * Get the extension of {file}
 * @param file  {string} - the file name / path
 * @returns {string} - extension of the file.
 */
function getFileExtension(file) {
	const name = typeof file === 'string' ? file : file.name;
	return path.extname(name).toLowerCase();
}

/**
 * Turn str into Title Case and return it.
 * @param str {string} - the string to transform
 * @returns {string} - Title Cased string
 */
function titleCase(str) {
	return str.split(' ')
		.map(i => i[0].toUpperCase() + i.substr(1).toLowerCase())
		.join(' ');
}

/**
 * Initialise NeDB in path
 * @param {string} path
 */
function createDB(path) {
	return new Promise(resolve => {
		const db = new Datastore({filename: path, autoload: true});
		resolve(db);
	});
}

function sendFile(dlPath) {
	if (server && server.listening) {
		server.close(() => {
			server = http.createServer((req, res) => {
				send(req, parseUrl(req).pathname, {root: dlPath}).pipe(res);
			}).listen(53324);
		});
		setImmediate(function () {
			server.emit('close');
		});
	} else {
		server = http.createServer((req, res) => {
			send(req, parseUrl(req).pathname, {root: dlPath}).pipe(res);
		}).listen(53324);
	}
}

module.exports = {
	isPlayable,
	titleCase,
	createDB,
	sendFile
};
