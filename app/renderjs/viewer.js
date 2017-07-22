/**
 * @author William Blythe
 * @fileoverview The file that allows viewing of downloaded media
 */
/**
 * @module Viewer
 */
/* eslint-disable no-unused-vars */
/* eslint-disable max-nested-callbacks */
require('dotenv').config({path: `${__dirname}/../.env`});
require('events').EventEmitter.prototype._maxListeners = 1000;
const Getimg = require(require('path').join(__dirname, '..', 'lib', 'get-imgs.js')).GetImgs;
const path = require('path');
const version = require('electron').remote.app.getVersion();
const fs = require('fs-extra');
const TVDB = require('node-tvdb');
const storage = require('electron-json-storage');
const Raven = require('raven');
const moment = require('moment');
const _ = require('underscore');
const parser = require('episode-parser');
const klawSync = require('klaw-sync');
const PouchDB = require('pouchdb');
const blobUtil = require('blob-util');
const {titleCase, isPlayable} = require(require('path').join(__dirname, '..', 'lib', 'utils.js'));

PouchDB.plugin(require('pouchdb-find'));
const tvdb = new TVDB(process.env.TVDB_KEY);
const vidProgressthrottled = _.throttle(vidProgress, 500);

Raven.config('https://3d1b1821b4c84725a3968fcb79f49ea1:1ec6e95026654dddb578cf1555a2b6eb@sentry.io/184666', {
	release: version
}).install();
/**
 * Add a context menu so that we can reset time watched.
 */
require('electron-context-menu')({
	prepend: (params, browserWindow) => [{
		label: 'Reset Time Watched',
		click: () => {
			resetTime(params);
		},
		// Only show it when right-clicking images
		visible: params.mediaType === 'image'
	}, {
		label: 'Remove Episode',
		click: () => {
			deleteTV(params);
		},
		// Only show it when right-clicking images
		visible: params.mediaType === 'image'
	}]
});

const progOpt = {
	template: 3,
	parent: '#media',
	start: true
};
let indeterminateProgress;
/**
 * Make sure that the window is loaded.
 */
window.onload = () => {
	indeterminateProgress = new Mprogress(progOpt); // eslint-disable-line no-undef
	findDL();
};

/**
 * Helper function to store images as blobs.
 * @param img {object} - image tag to convert to blob.
 * @param callback {function} - Returns blob of img.
 */
function convertImgToBlob(img, callback) {
	blobUtil.imgSrcToBlob(img.src).then(blob => {
		blobUtil.blobToBase64String(blob).then(base64String => {
			callback(base64String);
		}).catch(err => {
			Raven.captureException(err);
		});
	}).catch(err => {
		Raven.captureException(err);
	});
}
/**
 * Get images from the DB, if they exist in the DB.
 * @param data {Array} - Data needed to identify the image in the DB.
 * @returns {Promise}
 */
function getImgDB(data) {
	return new Promise(resolve => {
		const mediadiv = document.getElementById('media');
		const medianodes = mediadiv.childNodes;
		const tvelem = data[0];
		const elempath = data[1];
		const db = new PouchDB(require('path').join(require('electron').remote.app.getPath('userData'), 'dbImg').toString());
		medianodes.forEach((img, ind) => {
			if (ind === medianodes.length - 1) {
				indeterminateProgress.end();
				document.getElementById('Loading').style.display = 'none';
			}
			if (img.id === elempath) {
				img.children[0].parentNode.style.display = 'inline-block';
				db.find({selector: {_id: `img${tvelem.show.replace(' ', '')}S${tvelem.season}E${tvelem.episode}`}, fields: ['_id', '_rev']}).then(docs => {
					if (docs.docs.length > 0) {
						db.get(`img${tvelem.show.replace(' ', '')}S${tvelem.season}E${tvelem.episode}`, {attachments: true}).then(doc => {
							blobUtil.base64StringToBlob(doc._attachments.img.data, 'image/jpeg').then(blob => {
								img.children[0].src = URL.createObjectURL(blob); // eslint-disable-line
								resolve(['got from db']);
							}).catch(err => {
								Raven.captureException(err);
							});
						});
					}
				});
			}
		});
	});
}

/**
 * Get the path for downloads.
 * @returns {Promise.<string>}
 */
function getPath() {
	return new Promise(resolve => {
		storage.get('path', (err, data) => {
			if (err) {
				Raven.captureException(err);
			}
			if (_.isEmpty(data) === false) {
				resolve({path: data.path});
			} else {
				const dir = path.join(require('os').homedir(), 'media_mate_dl');
				fs.ensureDir(dir, err => {
					if (err) {
						Raven.captureException(err);
					}
					resolve({path: dir});
				});
			}
		});
	});
}
/**
 * Get images for each of the downloaded files.
 */
async function getImgs() {
	const mediadiv = document.getElementById('media');
	const medianodes = mediadiv.childNodes;
	let dlpath = await getPath();
	console.log(dlpath);
	dlpath = dlpath.path.toString();
	const getimgs = new Getimg(dlpath);
	getimgs.on('tvelem', data => {
		getImgDB(data).then(res => {

		});
	});
	getimgs.on('episode', data => {
		const db = new PouchDB(require('path').join(require('electron').remote.app.getPath('userData'), 'dbImg').toString());
		console.log('ep');
		const elem = data[0];
		const tvelem = data[1];
		const elempath = data[2];
		medianodes.forEach((img, ind) => {
			if (img.id === elempath) {
				tvdb.getEpisodeById(elem.id)
					.then(res => {
						if (ind === medianodes.length - 1) {
							indeterminateProgress.end();
							document.getElementById('Loading').style.display = 'none';
						}
						if (res.filename !== '') {
							img.children[0].src = `http://thetvdb.com/banners/${res.filename}`;
							convertImgToBlob(img.children[0], blob => {
								db.put({
									_id: `img${tvelem.show.replace(' ', '')}S${tvelem.season}E${tvelem.episode}`,
									elempath: data[2],
									elem: data[0],
									tvelem: data[1],
									_attachments: {
										img: {
											content_type: 'image/jpeg', // eslint-disable-line
											data: Buffer.from(blob, 'base64')
										}
									}
								});
							});
						} else if (res.filename === '') {
							img.children[0].src = `file:///${__dirname}/404.png`;
							img.children[0].parentNode.style.display = 'inline-block';
						}
					})
					.catch(err => {
						console.log(err);
						Raven.captureException(err);
					});
			}
		});
	});
}
/**
 * Called when a video is finished.
 * @param e {object} - the event.
 */
function vidFinished(e) {
	let filename;
	let elem;
	if (process.env.SPECTRON) {
		filename = 'TopGearS24E7';
		elem = document.getElementById('top.gear.s24e07.hdtv.x264-mtb.mp4');
	} else {
		filename = this.getAttribute('data-file-name');
		elem = document.getElementById(this.getAttribute('data-img-id'));
	}

	const figcap = elem.childNodes;
	storage.get(filename, (err, data) => {
		const time = data.time;
		const duration = data.duration;
		const percent = (time / duration) * 100;
		figcap[1].style.width = percent + '%';
		figcap[1].style.zIndex = 9999;
		figcap[1].style.position = 'relative';
		figcap[1].style.top = '0';
		figcap[1].style.marginTop = '0px';
		figcap[1].style.marginBottom = '0px';
		figcap[1].style.setProperty('margin', '0px 0px', 'important');
		figcap[1].style.backgroundColor = 'red';
		figcap[2].innerText = `${figcap[0].title} (${Math.round(percent)}% watched)`;
		if (err) {
			console.log(err);
			Raven.captureException(err);
		}
		storage.set(filename, {file: filename, watched: true, time: (process.env.SPECTRON ? 5.014 : this.duration), duration: (process.env.SPECTRON ? 5.014 : duration)}, err => {
			if (err) {
				Raven.captureException(err);
			}
		});
	});
}
/**
 * On video metadata loaded, add it to the JSON.
 * @param e {object} - event.
 */
function handleVids(e) {
	const filename = this.getAttribute('data-file-name');
	storage.get(filename, (err, data) => {
		if (err) {
			Raven.captureException(err);
		}
		if (_.isEmpty(data) === true) {
			storage.set(filename, {file: filename, watched: false, time: this.currentTime, duration: this.duration}, err => {
				if (err) {
					Raven.captureException(err);
				}
			});
		} else {
			this.currentTime = data.time;
		}
	});
}
/**
 * Delete tv from the filesystem / db.
 * @param {any} params - the file to remove
 */
function deleteTV(params) {
	const elem = document.elementFromPoint(params.x, params.y).parentNode;
	const storename = elem.getAttribute('data-store-name');
	const filename = elem.getAttribute('data-file-name');
	const db = new PouchDB(require('path').join(require('electron').remote.app.getPath('userData'), 'dbImg').toString());
	storage.get('path', (err, data) => {
		if (err) {
			Raven.captureException(err);
		} else {
			console.log(data);
			const files = klawSync(data.path, {nodir: true});
			_.each(files, (file, index) => {
				files[index] = file.path;
				const pathSplit = file.path.split('/');
				if (pathSplit[pathSplit.length - 1] === filename) {
					console.log('found it');
					console.log(file.path);
					console.log(path.resolve(`${file.path}/../`));
					require('sweetalert2')({
						title: 'Delete confirmation',
						text: `The following folder and its contents will be deleted: ${path.resolve(file.path + '/../')}`,
						type: 'warning',
						showCancelButton: true,
						confirmButtonColor: '#3085d6',
						cancelButtonColor: '#d33',
						confirmButtonText: 'Yes, delete it!'
					}).then(() => {
						fs.remove(path.resolve(`${file.path}/../`), err => {
							if (err) {
								Raven.captureException(err);
							}
							storage.remove(storename, err => {
								if (err) {
									Raven.captureException(err);
								}
							});
							db.get(`img${elem.getAttribute('data-store-name')}`).then(doc => {
								return db.remove(doc);
							}).then(result => {
								console.log(result);
							}).catch(err => {
								Raven.captureException(err);
							});
							elem.parentNode.removeChild(elem);
						});
					}, dismiss => {
						if (dismiss === 'cancel') {
							require('sweetalert2')(
								'Cancelled',
								'Nothing will be deleted.',
								'info'
							);
						}
					});
				}
			});
		}
	});
}

/**
 * Reset the time watched.
 * @param params {object} - the x / y of the image.
 */
function resetTime(params) {
	let elem;
	if (process.env.SPECTRON) {
		elem = document.getElementById('top.gear.s24e07.hdtv.x264-mtb.mp4');
	} else {
		elem = document.elementFromPoint(params.x, params.y).parentNode;
	}
	const filename = elem.getAttribute('data-store-name');
	const figcap = elem.childNodes;
	storage.get(filename, (err, data) => {
		if (err) {
			Raven.captureException(err);
		}
		const time = 0;
		const duration = data.duration;
		const percent = (time / duration) * 100;
		figcap[1].style.width = percent + '%';
		figcap[1].style.zIndex = 9999;
		figcap[1].style.position = 'relative';
		figcap[1].style.top = '0';
		figcap[1].style.marginTop = '0px';
		figcap[1].style.marginBottom = '0px';
		figcap[1].style.setProperty('margin', '0px 0px', 'important');
		figcap[1].style.backgroundColor = 'red';
		figcap[2].innerText = `${figcap[0].title}`;
		console.log(elem);
	});
	storage.remove(filename, err => {
		if (err) {
			Raven.captureException(err);
		}
	});
}
/**
 * On time update in the video, throttled for every few seconds.
 * @param e {object} - video event.
 */
function vidProgress(e) {
	const filename = this.getAttribute('data-file-name');
	const img = document.getElementById(this.getAttribute('data-img-id'));
	const time = this.currentTime;
	const duration = this.duration;
	const figcap = img.childNodes;
	const percent = (time / duration) * 100;
	if (time !== duration) {
		figcap[1].style.width = percent + '%';
		figcap[1].style.zIndex = 9999;
		figcap[1].style.position = 'relative';
		figcap[1].style.top = '0';
		figcap[1].style.marginTop = '0px';
		figcap[1].style.marginBottom = '0px';
		figcap[1].style.setProperty('margin', '0px 0px', 'important');
		figcap[1].style.backgroundColor = 'red';
		figcap[2].innerText = `${figcap[0].title} (${Math.round(percent)}% watched)`;
		storage.get(filename, (err, data) => {
			if (err) {
				Raven.captureException(err);
			}
			if (_.isEmpty(data) === false) {
				storage.set(filename, {file: filename, watched: false, time: this.currentTime, duration: this.duration}, err => {
					if (err) {
						Raven.captureException(err);
					}
				});
			} else {
				storage.set(filename, {file: filename, watched: false, time: this.currentTime, duration: this.duration}, err => {
					if (err) {
						Raven.captureException(err);
					}
				});
			}
		});
	} else if (time === duration) {
		storage.get(filename, (err, data) => {
			if (err) {
				console.log(err);
				Raven.captureException(err);
			}
			storage.set(filename, {file: filename, watched: true, time: this.currentTime, duration: this.duration}, err => {
				if (err) {
					Raven.captureException(err);
				}
			});
		});
	}
}
/**
 * Add and remove event handlers for the stop video button
 */
function handleEventHandlers() {
	const videodiv = document.getElementById('video');
	videodiv.removeChild(videodiv.firstElementChild);
	document.getElementById('stopvid').removeEventListener('click', handleEventHandlers);
}

async function watchedTime(vid, elem, figcap) {
	return new Promise((resolve, reject) => {
		storage.get(vid.getAttribute('data-store-name'), (err, data) => {
			if (err) {
				console.log(err);
				Raven.captureException(err);
			}
			if (_.isEmpty(data)) {
				elem.style.zIndex = 9999;
				elem.style.position = 'relative';
				elem.style.width = '0px';
				elem.style.backgroundColor = 'red';
				resolve(elem);
			} else if (data.watched === false) {
				const time = data.time;
				const duration = data.duration;
				const percent = (time / duration) * 100;
				elem.style.width = percent + '%';
				elem.style.zIndex = 9999;
				elem.style.position = 'relative';
				elem.style.top = '0';
				elem.style.marginTop = '0px';
				elem.style.marginBottom = '0px';
				elem.style.setProperty('margin', '0px 0px', 'important');
				elem.style.backgroundColor = 'red';
				figcap.innerText = `${figcap.innerText} (${Math.round(percent)}% watched)`;
				resolve(elem);
			} else if (data.watched === true) {
				const time = data.duration;
				const duration = data.duration;
				const percent = (time / duration) * 100;
				elem.style.width = percent + '%';
				elem.style.zIndex = 9999;
				elem.style.position = 'relative';
				elem.style.top = '0';
				elem.style.marginTop = '0px';
				elem.style.marginBottom = '0px';
				elem.style.setProperty('margin', '0px 0px', 'important');
				elem.style.backgroundColor = 'red';
				figcap.innerText = `${figcap.innerText} (${Math.round(percent)}% watched)`;
				resolve(elem);
			}
		});
	});
}

/**
 * Get files downloaded and process them to the DOM.
 */
async function findDL() {
	const path = await getPath();
	let files = klawSync(path.path, {nodir: true});
	_.each(files, (elem, index) => {
		files[index] = elem.path;
	});
	files = _.filter(files, isPlayable);
	files.sort();
	if (files.length === 0) {
		indeterminateProgress.end();
		document.getElementById('Loading').style.display = 'none';
		const elem = document.getElementById('media');
		const emptyElem = document.createElement('h1');
		emptyElem.className = 'title';
		console.log('empty');
		emptyElem.innerText = `You have not downloaded anything yet.`;
		const emptySubtitle = document.createElement('h2');
		emptyElem.style['text-align'] = 'center';
		emptySubtitle.innerText = `Go to the downloader first and do some downloading!`;
		emptySubtitle.className = 'subtitle';
		emptyElem.appendChild(emptySubtitle);
		elem.appendChild(emptyElem);
	}
	const mediadiv = document.getElementById('media');
	const videodiv = document.getElementById('video');
	for (let i = 0; i < files.length; i++) {
		const parsedName = parser(files[i].replace(/^.*[\\/]/, ''));
		if (parsedName !== null) {
			const figelem = document.createElement('figure');
			const figcap = document.createElement('figcaption');
			const imgelem = document.createElement('img');
			parsedName.show = titleCase(parsedName.show);
			figelem.addEventListener('click', () => {
				window.scrollTo(0, 0);
				const video = document.createElement('video');
				video.src = 'video://' + files[i];
				video.setAttribute('data-file-name', `${parsedName.show.replace(' ', '')}S${parsedName.season}E${parsedName.episode}`);
				video.setAttribute('data-store-name', `${parsedName.show.replace(' ', '')}S${parsedName.season}E${parsedName.episode}`);
				video.autoplay = true;
				video.controls = true;
				video.setAttribute('data-img-id', files[i].replace(/^.*[\\/]/, ''));
				video.addEventListener('loadedmetadata', handleVids, false);
				video.addEventListener('ended', vidFinished, false);
				video.addEventListener('timeupdate', vidProgress, false);
				document.getElementById('stopvid').addEventListener('click', handleEventHandlers);
				if (videodiv.childElementCount > 0) {
					videodiv.replaceChild(video, videodiv.firstElementChild);
				} else {
					videodiv.appendChild(video);
				}
			});
			imgelem.className = 'hvr-shrink';
			imgelem.id = 'img_' + files[i].replace(/^.*[\\/]/, '');
			imgelem.src = `file:///${__dirname}/loading.png`;
			figelem.style.display = 'inline-block';
			figelem.id = files[i].replace(/^.*[\\/]/, '');
			figelem.setAttribute('data-file-name', files[i].replace(/^.*[\\/]/, ''));
			figelem.setAttribute('data-store-name', `${parsedName.show.replace(' ', '')}S${parsedName.season}E${parsedName.episode}`);
			imgelem.title = `${parsedName.show}: S${parsedName.season}E${parsedName.episode}`;
			imgelem.style.width = '400px';
			imgelem.style.height = '225px';
			figelem.style.width = '400px';
			figelem.style.height = '225px';
			imgelem.style.display = 'inline-block';
			imgelem.style.zIndex = 1;
			figcap.innerText = `${parsedName.show}: S${parsedName.season}E${parsedName.episode}`;
			let watchedhr = document.createElement('hr');
			figelem.appendChild(imgelem);
			watchedhr = await watchedTime(figelem, watchedhr, figcap); // eslint-disable-line
			figelem.appendChild(watchedhr);
			figelem.appendChild(figcap);
			mediadiv.appendChild(figelem);
		}
	}
	if (files.length > 0) {
		getImgs();
	}
}
