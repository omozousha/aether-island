'use strict';

const { app, globalShortcut, BrowserWindow } = require('electron');
const path = require('node:path');
const { createSettingsStore } = require('./settings-store');
const { MediaBridge } = require('./media');
const { LyricsService } = require('./lyrics-service');
const { AiService } = require('./ai-service');
const { createSystemMonitor } = require('./system');
const { createClipStore } = require('./clips');
const { createIslandWindow, createSettingsWindow, setMode, getMode, centerSettings, MODES } = require('./windows');
const { createTray } = require('./tray');
const { registerIpc } = require('./ipc');
const { startAmbientLoop } = require('./glass');
const { clipboard } = require('electron');

const argv = new Set(process.argv.slice(app.isPackaged ? 1 : 2));
const DEMO = argv.has('--demo');
const SMOKE = argv.has('--smoke');

let store = null;
let media = null;
let lyrics = null;
let ai = null;
let system = null;
let clips = null;
let islandWindow = null;
let settingsWindow = null;
let tray = null;
let ambient = null;
let clipboardTimer = null;
let lastClipboardText = '';
let quitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.show();
      islandWindow.focus();
    }
  });
}

function userDataPath(name) {
  const dir = app.getPath('userData');
  app.setAppUserModelId?.('com.aether.island');
  return path.join(dir, name);
}

function scriptsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts')
    : path.join(__dirname, '..', '..', 'scripts');
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function normalizeMedia(raw) {
  const app = String(raw.app || '');
  let label = 'BROWSER';
  if (app.toLowerCase().includes('chrome')) label = 'CHROME';
  else if (app.toLowerCase().includes('msedge')) label = 'EDGE';
  else if (app.toLowerCase().includes('firefox')) label = 'FIREFOX';
  else if (app.toLowerCase().includes('spotify')) label = 'SPOTIFY';
  else if (app.toLowerCase().includes('brave')) label = 'BRAVE';
  else if (app) label = app.split(/[!.]/)[0].slice(0, 18).toUpperCase();

  const status = raw.status === 4 ? 'playing' : raw.status === 5 ? 'paused' : raw.active ? 'playing' : 'stopped';
  return {
    active: Boolean(raw.active),
    status,
    title: raw.title || '',
    artist: raw.artist || '',
    album: raw.album || '',
    app: app,
    appLabel: label,
    position: Number(raw.position) || 0,
    duration: Number(raw.duration) || 0,
    canNext: Boolean(raw.canNext),
    canPrev: Boolean(raw.canPrev),
    key: raw.key || '',
    art: raw.art || '',
    artKey: raw.artKey || '',
    error: raw.error || '',
  };
}

function wireMedia() {
  media.on('state', (raw) => {
    const state = normalizeMedia(raw);
    if (state.artKey && lastArtKey === state.artKey) {
      state.art = '';
      state.artChanged = false;
    } else {
      lastArtKey = state.artKey;
      state.artChanged = Boolean(state.art);
    }
    islandWindow?.webContents.send('media:state', state);
    if (state.active && state.title && lyrics) {
      lyrics.setTrack({ title: state.title, artist: state.artist, album: state.album });
      ai?.setContext && ai.setContextMedia(state);
    }
  });
  media.on('track', (raw) => {
    islandWindow?.webContents.send('media:track', normalizeMedia(raw));
  });
  lyrics.onState = (payload) => {
    islandWindow?.webContents.send('lyrics:state', payload);
  };
}

let lastArtKey = '';

function applyWindowSkin(win, s) {
  if (!win || win.isDestroyed()) return;
  try {
    const opacity = Number(s.windowOpacity);
    win.setOpacity(Number.isFinite(opacity) ? Math.min(1, Math.max(0.3, opacity)) : 1);
  } catch {}
}

const settingsListeners = [];
function notifySettingsChanged(snapshot) {
  for (const fn of settingsListeners) { try { fn(snapshot); } catch {} }
}

function broadcastSettings() {
  const snapshot = store.get();
  for (const fn of settingsListeners) { try { fn(snapshot); } catch {} }
}

function reloadHotkeys() {
  try { globalShortcut.unregisterAll(); } catch {}
  registerHotkeys();
}

function registerHotkeys() {
  const settings = store.get();
  const bindings = [
    { accel: settings.hotkeyToggle, handler: toggleIsland },
    { accel: settings.hotkeyAi, handler: summonAi },
    { accel: settings.hotkeyHide, handler: hideIsland },
    { accel: settings.hotkeyLyrics, handler: summonLyrics },
  ];
  for (const { accel, handler } of bindings) {
    if (!accel || typeof accel !== 'string') continue;
    try { globalShortcut.register(accel, handler); } catch {}
  }
}

function toggleIsland() {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  if (islandWindow.isVisible()) {
    const mode = getMode(islandWindow);
    setMode(islandWindow, mode === 'expanded' ? 'collapsed' : 'expanded');
    islandWindow.show();
    islandWindow.focus();
  } else {
    islandWindow.show();
    islandWindow.focus();
  }
}

function summonAi() {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  setMode(islandWindow, 'expanded');
  islandWindow.show();
  islandWindow.focus();
  islandWindow.webContents.send('app:command', { command: 'ai' });
}

function summonLyrics() {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  setMode(islandWindow, 'expanded');
  islandWindow.show();
  islandWindow.focus();
  islandWindow.webContents.send('app:command', { command: 'lyrics' });
}

function hideIsland() {
  islandWindow?.hide();
}

function startClipboardWatch() {
  if (clipboardTimer) clearInterval(clipboardTimer);
  clipboardTimer = setInterval(() => {
    if (!store || !store.get().clipboardHistory) return;
    if (!islandWindow || islandWindow.isDestroyed()) return;
    try {
      const text = clipboard.readText('clipboard');
      if (text && text.length <= 20000 && text !== lastClipboardText) {
        lastClipboardText = text;
        const entry = clips.add(text);
        if (entry) broadcast('clips:update', clips.list());
      }
    } catch {}
  }, 1400);
}

function startAmbient() {
  if (!islandWindow) return;
  ambient = startAmbientLoop({
    win: islandWindow,
    intervalMs: 1600,
    onSample: (sample) => {
      if (!islandWindow || islandWindow.isDestroyed()) return;
      islandWindow.webContents.send('glass:ambient', sample);
    },
  });
}

async function createWindows() {
  const preloadIsland = path.join(__dirname, '..', 'preload', 'preload.js');
  const preloadSettings = path.join(__dirname, '..', 'preload', 'settings.js');

  islandWindow = createIslandWindow({ preload: preloadIsland, dev: false });
  islandWindow.once('ready-to-show', () => islandWindow.show());

  islandWindow.on('blur', () => {
    if (store.get().autoCollapse !== false && getMode(islandWindow) === 'expanded') {
      setMode(islandWindow, 'collapsed');
    }
  });

  islandWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  islandWindow.webContents.on('will-navigate', (event) => event.preventDefault());
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const preloadSettings = path.join(__dirname, '..', 'preload', 'settings.js');
  settingsWindow = createSettingsWindow({ preload: preloadSettings });
  settingsWindow.once('ready-to-show', () => {
    centerSettings(settingsWindow);
    settingsWindow.show();
    settingsWindow.focus();
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  settingsWindow.on('closed', () => { settingsWindow = undefined; });
}

app.whenReady().then(() => {
  store = createSettingsStore({
    filePath: userDataPath('settings.json'),
    safeStorage: require('electron').safeStorage,
    app,
  });

  system = createSystemMonitor({ cacheFile: userDataPath('sys-cache.json') });
  clips = createClipStore({ filePath: userDataPath('clips.json') });

  media = new MediaBridge({
    scriptsDir: scriptsDir(),
    demo: DEMO || process.platform !== 'win32',
  });
  media.start();

  ai = new AiService({
    getSettings: () => store.get(),
    getApiKey: () => store.getApiKey(),
    getMedia: () => media.state ? normalizeMedia(media.state) : null,
    getSystem: () => system.cachedSnapshot || null,
    getClipboard: () => clips.list(),
    sendDelta: (payload) => islandWindow?.webContents.send('ai:delta', payload),
    sendDone: (payload) => islandWindow?.webContents.send('ai:done', payload),
    sendError: (payload) => islandWindow?.webContents.send('ai:error', payload),
  });

  lyrics = new LyricsService({
    getSettings: () => store.get(),
    getApiKey: () => store.getApiKey(),
    onState: (payload) => islandWindow?.webContents.send('lyrics:state', payload),
  });

  createWindows();
  wireMedia();
  registerIpc({
    windows: {
      get island() { return islandWindow; },
      get settings() { return settingsWindow; },
      openSettings,
    },
    store, media, lyrics, ai, system, clips, broadcast,
  });
  const { setSettingsNotifier } = require('./ipc');
  setSettingsNotifier(notifySettingsChanged);
  registerHotkeys();
  applyWindowSkin(islandWindow, store.get());
  const hotkeySnapshot = () => JSON.stringify([store.get().hotkeyToggle, store.get().hotkeyAi, store.get().hotkeyHide, store.get().hotkeyLyrics]);
  let lastHotkeys = hotkeySnapshot();
  settingsListeners.push((s) => {
    applyWindowSkin(islandWindow, s);
    if (hotkeySnapshot() !== lastHotkeys) { lastHotkeys = hotkeySnapshot(); reloadHotkeys(); }
  });
  startClipboardWatch();
  startAmbient();

  tray = createTray({
    onShow: () => { islandWindow?.show(); islandWindow?.focus(); },
    onHide: () => islandWindow?.hide(),
    onAi: () => summonAi(),
    onLyrics: () => summonLyrics(),
    onSettings: () => openSettings(),
    onQuit: () => app.quit(),
  });

  if (SMOKE) {
    const { runSmoke } = require('./smoke');
    runSmoke({ islandWindow, setMode, summonAi, openSettings, app });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !SMOKE) {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (quitting) return;
  quitting = true;
  try { media?.stop(); } catch {}
  try { ai?.dispose(); } catch {}
  try { lyrics?.dispose(); } catch {}
  try { ambient?.stop(); } catch {}
  if (clipboardTimer) clearInterval(clipboardTimer);
  try { globalShortcut.unregisterAll(); } catch {}
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
});
