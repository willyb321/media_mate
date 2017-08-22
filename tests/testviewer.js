const test = require('tape');
const setup = require('./setup');

test('viewer', t => {
	t.timeoutAfter(40e3);
	const app = setup.createApp();
	setup.waitForLoad(app, t, {online: true})
		.then(() => app.browserWindow.focus())
		.then(() => app.client.waitUntilTextExists('#viewer', 'Go to Viewer'))
		.then(() => app.client.moveToObject('#viewer'))
		.then(() => setup.wait())
		.then(() => app.client.click('#viewer'))
		.then(() => setup.wait(7e3))
		.then(() => app.browserWindow.focus())
		.then(() => setup.wait())
		.then(() => app.webContents.executeJavaScript('resetTime()'))
		.then(() => setup.screenshotCreateOrCompare(app, t, 'viewer'))
		.then(() => app.client.click('.hvr-shrink'))
		.then(() => setup.wait())
		.then(() => app.webContents.executeJavaScript('document.getElementById("video").firstElementChild.pause()'))
		.then(() => setup.wait())
		.then(() => app.webContents.executeJavaScript('document.getElementById("video").firstElementChild.currentTime = 1'))
		.then(() => setup.wait())
		.then(() => setup.screenshotCreateOrCompare(app, t, 'viewervideo'))
		.then(() => setup.endTest(app, t),
			err => setup.endTest(app, t, err || 'error'));
});
