'use strict';

const { ipcMain, clipboard, shell, app } = require('electron');
const { setMode, getMode } = require('./windows');
const { listActions } = require('../shared/prompts');
const { isSafeExternalUrl } = require('../shared/text');

const VALID_MODES = new Set(['collapsed', 'expanded']);
const VALID_COMMANDS = new Set(['toggle', 'play', 'pause', 'next', 'previous', 'seek']);
const VALID_ACTIONS = new Set(listActions().map((a) => a.id));

let settingsNotifier = null;
function setSettingsNotifier(fn) { settingsNotifier = typeof fn === 'function' ? fn : null; }
function notifySettingsChanged(snapshot) { try { settingsNotifier?.(snapshot); } catch {} }

function registerIpc({ windows, store, media, lyrics, ai, system, clips, broadcast }) {
  const settingsChanged = () => {
    const snapshot = store.get();
    notifySettingsChanged(snapshot);
    broadcast('settings:changed', snapshot);
  };

  ipcMain.handle('app:info', () => {
    const settings = store.get();
    return {
      name: 'Aether Island',
      version: app.getVersion(),
      platform: process.platform,
      isPackaged: app.isPackaged,
      actions: listActions(),
      hotkeys: {
        toggle: settings.hotkeyToggle,
        ai: settings.hotkeyAi,
        hide: settings.hotkeyHide,
        lyrics: settings.hotkeyLyrics,
      },
      model: settings.model,
    };
  });

  ipcMain.handle('settings:get', () => store.get());

  ipcMain.handle('settings:set', (_event, patch) => {
    if (!patch || typeof patch !== 'object') return store.get();
    const sanitized = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'apiKey') {
        if (typeof value === 'string' && value.length <= 320) sanitized.apiKey = value.trim();
        continue;
      }
      if (typeof value === 'boolean') sanitized[key] = value;
      if (typeof value === 'number' && Number.isFinite(value)) sanitized[key] = value;
      if (typeof value === 'string' && value.length <= 64) sanitized[key] = value;
    }
    if (Object.keys(sanitized).length) {
      store.set(sanitized);
      settingsChanged();
    }
    return store.get();
  });

  ipcMain.handle('settings:models', async () => {
    const apiKey = store.getApiKey();
    if (!apiKey) throw new Error('API key AI Gater belum diisi.');
    const { listModels } = require('./ai-client');
    return listModels(apiKey);
  });

  ipcMain.handle('settings:test', async (_event, payload = {}) => {
    const { testConnection } = require('./ai-client');
    const apiKey = typeof payload.apiKey === 'string' && payload.apiKey.trim()
      ? payload.apiKey.trim()
      : store.getApiKey();
    if (!apiKey) throw new Error('API key belum diisi.');
    const settings = store.get();
    return testConnection({ apiKey, model: payload.model || settings.model });
  });

  ipcMain.handle('settings:clear-key', () => {
    store.set({ apiKey: '' });
    settingsChanged();
    return store.get();
  });

  ipcMain.handle('sys:snapshot', () => system.snapshot());

  ipcMain.handle('clips:list', () => clips.list());
  ipcMain.handle('clips:remove', (_event, { id } = {}) => {
    if (typeof id === 'string') clips.remove(id);
    return clips.list();
  });
  ipcMain.handle('clips:clear', () => {
    clips.clear();
    return clips.list();
  });
  ipcMain.handle('clips:copy', (_event, { text } = {}) => {
    if (typeof text === 'string' && text && text.length <= 20000) {
      clipboard.writeText(text, 'clipboard');
      clips.add(text);
      broadcast('clips:update', clips.list());
    }
    return clips.list();
  });

  ipcMain.handle('media:snapshot', () => media.snapshot());

  ipcMain.on('media:command', (_event, { action, position } = {}) => {
    if (!VALID_COMMANDS.has(action)) return;
    const isNumeric = Number.isFinite(Number(position)) && Number(position) >= 0;
    media.command(action, isNumeric ? Number(position) : undefined);
  });

  ipcMain.on('lyrics:refresh', () => lyrics.refresh());
  ipcMain.on('lyrics:clear-translation', () => lyrics.clearTranslation());
  ipcMain.handle('lyrics:translate', (_event, { target } = {}) => {
    return lyrics.translate(target === 'en' ? 'en' : 'id');
  });

  ipcMain.on('ai:chat', (_event, payload = {}) => {
    const id = typeof payload.id === 'string' && payload.id ? payload.id : `ai-${Date.now().toString(36)}`;
    const text = String(payload.text || '').trim();
    if (!text) return;
    const history = Array.isArray(payload.history) ? payload.history.slice(-24) : [];
    const flags = payload.context || {};
    const context = ai.buildContext({
      useTrack: Boolean(flags.track),
      useClipboard: Boolean(flags.clipboard),
      useSystem: Boolean(flags.system),
    });
    const actionId = VALID_ACTIONS.has(payload.actionId) ? payload.actionId : null;
    if (actionId) ai.runAction({ id, actionId, text, context });
    else ai.chat({ id, text, history, context });
  });

  ipcMain.on('ai:abort', (_event, { id } = {}) => {
    if (typeof id === 'string') ai.abort(id);
  });

  ipcMain.on('win:mode', (_event, { mode } = {}) => {
    if (VALID_MODES.has(mode)) setMode(windows.island, mode);
  });

  ipcMain.on('win:hide', () => windows.island?.hide());
  ipcMain.on('win:quit', () => { app.quit(); });

  ipcMain.on('win:settings', () => windows.openSettings());
  ipcMain.on('win:settings-close', () => {
    windows.settings?.close();
    windows.settings = undefined;
  });

  ipcMain.on('app:open-external', (_event, { url } = {}) => {
    if (typeof url === 'string' && isSafeExternalUrl(url)) shell.openExternal(url);
  });

  ipcMain.on('app:quit', () => app.quit());

  return {
    setMode,
    getMode,
    validCommands: VALID_COMMANDS,
    validActions: VALID_ACTIONS,
  };
}

module.exports = { registerIpc, setSettingsNotifier, VALID_MODES, VALID_COMMANDS, VALID_ACTIONS };
