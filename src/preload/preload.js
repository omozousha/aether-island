'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = Object.freeze({
  platform: process.platform,

  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.send('app:open-external', { url }),
    quit: () => ipcRenderer.send('app:quit'),
    onCommand: (cb) => subscribe('app:command', cb),
  },

  media: {
    onState: (cb) => subscribe('media:state', cb),
    onTrack: (cb) => subscribe('media:track', cb),
    state: () => ipcRenderer.invoke('media:snapshot'),
    command: (action, position) => ipcRenderer.send('media:command', { action, position }),
  },

  lyrics: {
    onState: (cb) => subscribe('lyrics:state', cb),
    refresh: () => ipcRenderer.send('lyrics:refresh'),
    translate: (target) => ipcRenderer.invoke('lyrics:translate', { target }),
    clearTranslation: () => ipcRenderer.send('lyrics:clear-translation'),
  },

  ai: {
    onDelta: (cb) => subscribe('ai:delta', cb),
    onDone: (cb) => subscribe('ai:done', cb),
    onError: (cb) => subscribe('ai:error', cb),
    chat: (payload) => ipcRenderer.send('ai:chat', payload),
    abort: (id) => ipcRenderer.send('ai:abort', { id }),
    models: () => ipcRenderer.invoke('settings:models'),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    onChanged: (cb) => subscribe('settings:changed', cb),
  },

  system: {
    snapshot: () => ipcRenderer.invoke('sys:snapshot'),
  },

  clips: {
    list: () => ipcRenderer.invoke('clips:list'),
    copy: (text) => ipcRenderer.invoke('clips:copy', { text }),
    remove: (id) => ipcRenderer.invoke('clips:remove', { id }),
    clear: () => ipcRenderer.invoke('clips:clear'),
    onUpdate: (cb) => subscribe('clips:update', cb),
  },

  glass: {
    onAmbient: (cb) => subscribe('glass:ambient', cb),
  },

  win: {
    mode: (mode) => ipcRenderer.send('win:mode', { mode }),
    onMode: (cb) => subscribe('win:mode', cb),
    hide: () => ipcRenderer.send('win:hide'),
    settings: () => ipcRenderer.send('win:settings'),
  },
});

contextBridge.exposeInMainWorld('aether', api);
module.exports = api;
