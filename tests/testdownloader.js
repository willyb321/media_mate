const test = require('tape');
const setup = require('./setup');
const config = require('./config');
test('downloader', t => {
	setup.resetTestDataDir();
	t.timeoutAfter(30e3);
	const app = setup.createApp();
	setup.waitForLoad(app, t, {online: true})
		.then(() => app.browserWindow.focus())
		.then(() => app.client.waitUntilTextExists('#downloader', 'Go to Downloader'))
		.then(() => app.client.moveToObject('#downloader'))
		.then(() => setup.wait())
		.then(() => app.client.click('#downloader'))
		.then(() => setup.wait(6e3))
		.then(() => {
			app.electron.clipboard.writeText('https://cdn.rawgit.com/willyb321/media_mate/4c10674eaa76d9006b2ad4826a8c69b888386c39/tests/resources/downloader_test.rss')
				.electron.clipboard.readText().then(function (clipboardText) {
					app.client.moveToObject('#rss')
						.then(() => setup.wait())
						.then(() => app.client.click('#rss'))
						.then(() => setup.wait())
						.then(() => app.client.element('#rss').setValue(clipboardText))
						.then(() => app.client.moveToObject('#title'))
						.then(() => setup.wait())
						.then(() => app.client.click('#dupecount'))
						.then(() => setup.wait(2e3))
						.then(() => app.client.executeAsync(async function (done) {
							let swalcon = await getSwalConfirmButton()
							swalcon.id = 'downloaderSwalConfirmBut'
							done({id: swalcon.id});
						}))
						.then(result => t.equal(result.value.id, 'downloaderSwalConfirmBut', 'Sweetalert ok button\'s id was set to "downloaderSwalConfirmBut"'))
						.then(() => setup.screenshotCreateOrCompare(app, t, 'downloader-sweetalert'))
						.then(() => setup.wait())
						.then(() => app.client.click('#downloaderSwalConfirmBut'))
						.then(() => setup.wait(3e3))
						.then(() => setup.screenshotCreateOrCompare(app, t, 'downloader-downloads'))
						.then(() => app.webContents.executeJavaScript('insertDlPath()'))
						.then(() => setup.endTest(app, t),
							err => setup.endTest(app, t, err || 'error'));
				});
		});
});
