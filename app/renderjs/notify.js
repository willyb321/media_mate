const ipcRenderer = require('electron').ipcRenderer;
function notify(title, body) {
	let notif = new Notification(title, {
		body: body.toString()
	});
	notif.onclick = () => {
		console.log('notif clicked');
	};
}
ipcRenderer.on('newdl', (event, data) => {
	if (data.length === 2) {
		notify(data[0], data[1]);
	}
});

ipcRenderer.on('offline', (event, data) => {
	require('sweetalert2')('Offline', 'You are offline, thats fine though.', 'info');
});

function firstrun() {
	require('sweetalert2')({
		title: 'Want to check out the tutorial?',
		text: 'I noticed this is your first run.',
		type: 'question',
		showCancelButton: true,
		confirmButtonColor: '#3085d6',
		cancelButtonColor: '#d33',
		confirmButtonText: 'Yes!'
	}).then(function () {
		require('electron').remote.getCurrentWindow().loadURL(`file://${__dirname}/../renderhtml/onboard.html`)
	}).catch(err => {
		if (err !== 'cancel') {
			console.log(err);
		}
	});
}
function sweetAlert(title, text, type) {
	require('sweetalert2')({
		title: title,
		text: text,
		type: type
	})
}
