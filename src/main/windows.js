'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('node:path');

const MODES = Object.freeze({
  collapsed: { w: 398, h: 96 },
  expanded: { w: 484, h: 792 },
});
const SETTINGS_SIZE = { w: 620, h: 760 };
const MODE_ANIMATION_MS = 280;

const currentMode = new WeakMap();

function displayFor(win) {
  try {
    return screen.getDisplayMatching(win.getBounds());
  } catch {
    return screen.getPrimaryDisplay();
  }
}

function clampToWorkArea(bounds, workArea) {
  const rawWidth = Number(bounds.width) || Number(bounds.w) || 0;
  const rawHeight = Number(bounds.height) || Number(bounds.h) || 0;
  const area = workArea && Number(workArea.width) > 0 && Number(workArea.height) > 0
    ? workArea : { x: 0, y: 0, width: Math.max(rawWidth, 800), height: Math.max(rawHeight, 600) };
  const width = Math.max(1, Math.min(rawWidth, area.width - 8));
  const height = Math.max(1, Math.min(rawHeight, area.height - 12));
  const x = Math.round(area.x + (area.width - width) / 2);
  const y = area.y + 8;
  return { x, y, width, height };
}

function createIslandWindow({ preload, dev = false }) {
  const display = screen.getPrimaryDisplay();
  const target = clampToWorkArea({ x: 0, y: 0, ...MODES.collapsed }, display.workArea);

  const win = new BrowserWindow({
    width: target.width,
    height: target.height,
    x: target.x,
    y: target.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    roundedCorners: false,
    title: 'Aether Island',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: dev,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenu?.(null);
  try {
    win.on('show', () => console.log('[aether] island shown'));
    win.on('hide', () => console.log('[aether] island hidden'));
    win.on('closed', () => console.log('[aether] island closed'));
  } catch {}
  win.loadFile(path.join(__dirname, '..', 'renderer', 'island', 'index.html'));
  currentMode.set(win, 'collapsed');
  if (dev) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

function createSettingsWindow({ preload, dev = false, width = SETTINGS_SIZE.w, height = SETTINGS_SIZE.h }) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'Pengaturan · Aether Island',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.setMenu?.(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'index.html'));
  if (dev) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

function setMode(win, mode) {
  if (!win || win.isDestroyed()) return;
  const shape = MODES[mode];
  if (!shape) return;
  currentMode.set(win, mode);
  const workArea = displayFor(win).workArea;
  const target = clampToWorkArea({ ...shape }, workArea);
  animateBounds(win, target);
  try { win.webContents.send('win:mode', mode); } catch {}
}

function animateBounds(win, target) {
  if (!win || win.isDestroyed()) return;
  if (win.__boundsTimer) clearInterval(win.__boundsTimer);
  const start = win.getBounds();
  const change = { x: target.x - start.x, y: target.y - start.y, width: target.width - start.width, height: target.height - start.height };
  const started = Date.now();
  const duration = MODE_ANIMATION_MS;

  win.__boundsTimer = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(win.__boundsTimer); win.__boundsTimer = null; return; }
    const progress = Math.min(1, (Date.now() - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    try {
      win.setBounds({
        x: Math.round(start.x + change.x * eased),
        y: Math.round(start.y + change.y * eased),
        width: Math.round(start.width + change.width * eased),
        height: Math.round(start.height + change.height * eased),
      }, false);
    } catch {}
    if (progress >= 1) {
      clearInterval(win.__boundsTimer);
      win.__boundsTimer = null;
    }
  }, 16);
}

function getMode(win) {
  return currentMode.get(win) || 'collapsed';
}

function centerSettings(win) {
  if (!win || win.isDestroyed()) return;
  const display = screen.getDisplayMatching(win.getBounds());
  const { width, height } = win.getBounds();
  win.setPosition(
    Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    false,
  );
}

module.exports = {
  MODES,
  SETTINGS_SIZE,
  createIslandWindow,
  createSettingsWindow,
  setMode,
  getMode,
  centerSettings,
  clampToWorkArea,
};
