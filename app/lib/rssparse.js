/**
 * @author William Blythe
 * @fileoverview Parse ShowRSS feeds
 */
/**
 * @module RSS-Parse
 */

const events = require('events');
const FeedParser = require('feedparser');
const request = require('request'); // For fetching the feed
const isRenderer = require('is-electron-renderer');
const isOnline = require('is-online');
let Raven;
let version;
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
 * Class for parsing RSS
 */
class RSSParse extends events.EventEmitter {
	/**
	 * The constructor for RSSParse
	 * @param rssFeed {string} - string with url to a showRSS feed.
	 */
	constructor(rssFeed) {
		super(rssFeed);
		this.rssFeed = rssFeed;
		isOnline().then(online => {
			if (online === false) {
				this.emit('offline', online);
			} else {
				this.reqFeed();
			}
		});
	}

	/**
	 * Send a HTTP request to the url from {@link RSSParse#rssFeed}
	 */
	reqFeed() {
		const rssThis = this;
		const req = request(this.rssFeed);
		const feedparser = new FeedParser();
		req.on('error', err => {
			this.emit('error', err);
		});

		req.on('response', function (res) {
			const stream = this; // `this` is `req`, which is a stream

			if (res.statusCode === 200) {
				stream.pipe(feedparser);
				feedparser.on('error', err => {
					rssThis.emit('error', err);
				});

				feedparser.on('readable', function () {
					// This is where the action is!
					const stream = this; // `this` is `feedparser`, which is a stream
					// **NOTE** the "meta" is always available in the context of the feedparser instance
					const meta = this.meta; // eslint-disable-line no-unused-vars
					let item;
					// eslint-disable-next-line no-cond-assign
					while (item = stream.read()) { // Don't loop to the point of crashing ;)
						rssThis.emit('data', item);
					}
				});
				feedparser.on('end', () => {
					rssThis.emit('finish');
				});
			} else {
				this.emit('error', new Error('Bad status code'));
			}
		});
	}
}
module.exports = {
	RSSParse
};
