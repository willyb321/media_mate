import {ipcRenderer, remote} from 'electron';
import {swal as swalNotify} from 'sweetalert2';

ipcRenderer.on('offline', (event, data) => {
	swalNotify('Offline', 'You are offline, thats fine though.', 'info');
});

function firstrun() {
	swalNotify({
		title: 'Want to check out the tutorial?',
		text: 'I noticed this is your first run.',
		type: 'question',
		showCancelButton: true,
		confirmButtonColor: '#3085d6',
		cancelButtonColor: '#d33',
		confirmButtonText: 'Yes!'
	}).then(function () {
		remote.getCurrentWindow().loadURL(`file://${__dirname}/../renderhtml/onboard.html`)
	}).catch(err => {
		if (err !== 'cancel') {
			console.log(err);
		}
	});
}
function sweetAlert(title, text, type) {
	swalNotify({
		title: title,
		text: text,
		type: type
	})
}
