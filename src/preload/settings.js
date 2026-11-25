'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = Object.freeze({
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.invoke('settings:set', patch),
  models: () => ipcRenderer.invoke('settings:models'),
  test: (payload) => ipcRenderer.invoke('settings:test', payload),
  clearKey: () => ipcRenderer.invoke('settings:clear-key'),
  clearClips: () => ipcRenderer.invoke('clips:clear'),
  info: () => ipcRenderer.invoke('app:info'),
  close: () => ipcRenderer.send('win:settings-close'),
  openExternal: (url) => ipcRenderer.send('app:open-external', { url }),
  onChanged: (cb) => subscribe('settings:changed', cb),
});

contextBridge.exposeInMainWorld('aetherSettings', api);
module.exports = api;
