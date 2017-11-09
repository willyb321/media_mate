import {ipcRenderer as ipc} from 'electron';
import log from 'electron-log';

function makeReleaseNotesFancy(notes, version) {
	const releaseNotesDiv = document.getElementById('notes');
	const versionHeader = document.getElementById('version');
	versionHeader.innerHTML = `<h1>Changelog for ${version}</h1>`;
	releaseNotesDiv.innerHTML = notes;
}

log.info('Rendering release notes.');
const {notes, version} = ipc.sendSync('releaseLoaded', 'ping');
log.info(notes);
log.info(version);

makeReleaseNotesFancy(notes, version);
