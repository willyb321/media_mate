/**
 * @module Menu
 */

module.exports = {
	init,
	getMenuItem
};
import electron, {BrowserWindow, shell} from 'electron';
import path from 'path';
import openAboutWindow from 'about-window';

const app = electron.app;
let win;
let menu;
/**
 * Initialise the menu.
 */
export function init() {
	menu = electron.Menu.buildFromTemplate(getMenuTemplate());
	electron.Menu.setApplicationMenu(menu);
	win = BrowserWindow.getAllWindows()[0];
}

/**
 * Helper function to get menu item from a label
 * @param {string} label - name of the menu item to find.
 * @returns {object} - the menu item.
 */
function getMenuItem(label) {
	for (let i = 0; i < menu.items.length; i++) {
		const menuItem = menu.items[i].submenu.items.find(item => {
			return item.label === label;
		});
		if (menuItem) {
			return menuItem;
		}
	}
}
/**
 * Menu template.
 */
function getMenuTemplate() {
	const template = [
		{
			label: 'File',
			submenu: [
				{
					label: 'Homepage',
					click: () => {
						win.loadURL(`file://${__dirname}/../renderhtml/index.html`);
					}
				},
				{
					label: 'Downloader',
					click: () => {
						win.loadURL(`file://${__dirname}/../renderhtml/downloader.html`);
					}
				},
				{
					label: 'Viewer',
					click: () => {
						win.loadURL(`file://${__dirname}/../renderhtml/viewer.html`);
					}
				},
				{
					label: 'Streamer',
					click: () => {
						win.loadURL(`file://${__dirname}/../renderhtml/streamer.html`);
					}
				},
				{
					label: 'Tutorial',
					click: () => {
						win.loadURL(`file://${__dirname}/../renderhtml/onboard.html`);
					}
				}
			]
		},
		{
			label: 'Edit',
			submenu: [
				{
					role: 'cut'
				},
				{
					role: 'copy'
				},
				{
					role: 'paste'
				}
			]
		},
		{
			label: 'View',
			submenu: [
				{
					role: 'reload'
				},
				{
					role: 'forcereload'
				},
				{
					type: 'separator'
				},
				{
					role: 'togglefullscreen'
				}
			]
		},
		{
			role: 'window',
			submenu: [
				{
					role: 'minimize'
				},
				{
					role: 'close'
				}
			]
		},
		{
			role: 'help',
			submenu: [
				{
					label: 'Tutorial',
					click() {
						win.loadURL(`file://${__dirname}/../renderhtml/onboard.html`);
					}

				},
				{
					label: 'Learn More about Electron',
					click() {
						shell.openExternal('http://electron.atom.io');
					}

				}, {
					label: 'About',
					click: () => openAboutWindow({
						icon_path: path.join(__dirname, '..', 'renderhtml', 'icon.png'), // eslint-disable-line camelcase
						bug_report_url: 'https://github.com/willyb321/media_mate/issues', // eslint-disable-line camelcase
						homepage: 'https://github.com/willyb321/media_mate'
					})
				}
			]
		}
	];
	// Mac menu
	if (process.platform === 'darwin') {
		template.unshift({
			label: app.getName(),
			submenu: [
				{
					role: 'about'
				},
				{
					type: 'separator'
				},
				{
					role: 'services',
					submenu: []
				},
				{
					type: 'separator'
				},
				{
					role: 'hide'
				},
				{
					role: 'hideothers'
				},
				{
					role: 'unhide'
				},
				{
					type: 'separator'
				},
				{
					role: 'quit'
				}
			]
		});
		// Edit menu.
		// Window menu.
		template[3].submenu = [
			{
				label: 'Close',
				accelerator: 'CmdOrCtrl+W',
				role: 'close'
			},
			{
				label: 'Minimize',
				accelerator: 'CmdOrCtrl+M',
				role: 'minimize'
			},
			{
				label: 'Zoom',
				role: 'zoom'
			},
			{
				type: 'separator'
			},
			{
				label: 'Bring All to Front',
				role: 'front'
			}
		];
	}
	return template;
}
