'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function createTray({ onShow, onHide, onAi, onSettings, onQuit, onLyrics }) {
  const iconPath = require('electron').app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'tray.png')
    : path.join(__dirname, '..', '..', 'build', 'tray.png');
  let tray = null;
  try {
    if (fs.existsSync(iconPath)) {
      const image = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
      if (!image.isEmpty()) {
        tray = new Tray(image);
        tray.setToolTip('Aether Island');
      }
    }
  } catch {}
  if (!tray) return null;

  const menu = Menu.buildFromTemplate([
    { label: 'Tampilkan Island', click: () => onShow?.() },
    { label: 'Sembunyikan', click: () => onHide?.() },
    { label: 'Asisten AI', click: () => onAi?.() },
    { label: 'Lirik', click: () => onLyrics?.() },
    { type: 'separator' },
    { label: 'Pengaturan', click: () => onSettings?.() },
    { type: 'separator' },
    { label: 'Keluar', click: () => onQuit?.() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => onShow?.());
  return tray;
}

module.exports = { createTray };
