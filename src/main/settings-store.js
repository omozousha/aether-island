'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  model: 'openai/gpt-4o-mini',
  apiKey: '',
  launchAtLogin: false,
  lyrics: true,
  showAlbumArt: true,
  clipboardHistory: true,
  aiEnabled: true,
  theme: 'violet',
  accent: '#9f84ff',
  personality: 'ringkas',
  language: 'id',
  translationTarget: 'off',
  hotkeyToggle: 'Alt+Shift+Space',
  hotkeyAi: 'Alt+Shift+A',
  hotkeyHide: 'Alt+Shift+H',
  hotkeyLyrics: 'Alt+Shift+L',
  windowOpacity: 1.0,
  windowBlur: 30,
  autoCollapse: true,
  showBattery: true,
  lyricsOffsetMs: 0,
});

const PATCHABLE = new Set(Object.keys(DEFAULTS));

const BOOLEAN_KEYS = new Set(['launchAtLogin', 'lyrics', 'showAlbumArt', 'clipboardHistory', 'aiEnabled', 'autoCollapse', 'showBattery']);
const NUMBER_KEYS = new Set(['windowOpacity', 'windowBlur', 'lyricsOffsetMs']);

function createSettingsStore({ filePath, safeStorage, app }) {
  let data = { ...DEFAULTS };

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const merged = {};
      for (const key of PATCHABLE) {
        merged[key] = Object.prototype.hasOwnProperty.call(parsed, key) ? coerce(key, parsed[key]) : DEFAULTS[key];
      }
      data = merged;
      if (parsed.apiKeyEncrypted && safeStorage?.isEncryptionAvailable()) {
        try {
          data.apiKey = safeStorage.decryptString(Buffer.from(parsed.apiKeyEncrypted, 'base64'));
        } catch { data.apiKey = ''; }
        delete data.apiKeyEncrypted;
      }
    } catch {}
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const output = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'apiKey') continue;
      output[key] = value;
    }
    if (data.apiKey) {
      if (!safeStorage?.isEncryptionAvailable()) throw new Error('Enkripsi sistem belum tersedia; API key tidak disimpan.');
      output.apiKeyEncrypted = safeStorage.encryptString(data.apiKey).toString('base64');
    }
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), { mode: 0o600 });
  }

  function coerce(key, value) {
    if (BOOLEAN_KEYS.has(key)) return Boolean(value);
    if (NUMBER_KEYS.has(key)) {
      const n = Number(value);
      return Number.isFinite(n) ? n : DEFAULTS[key];
    }
    if (typeof value !== 'string') return DEFAULTS[key];
    if (key === 'model' || key === 'accent' || key === 'personality' || key === 'language' || key === 'theme' || key.startsWith('hotkey')) {
      return value.slice(0, 180);
    }
    if (key === 'apiKey') return value.length <= 320 ? value.trim() : '';
    return String(value).slice(0, 64);
  }

  load();
  persist();

  return {
    get() {
      return {
        ...data,
        hasApiKey: Boolean(data.apiKey),
        encryptionAvailable: Boolean(safeStorage?.isEncryptionAvailable?.()),
      };
    },
    getApiKey() { return data.apiKey || ''; },
    set(patch = {}) {
      if (!patch || typeof patch !== 'object') return this.get();
      let changed = false;
      for (const key of PATCHABLE) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        const next = coerce(key, patch[key]);
        if (data[key] !== next) { data[key] = next; changed = true; }
      }
      if (data.model && data.model.length > 180) data.model = DEFAULTS.model;
      if (typeof data.launchAtLogin === 'boolean' && app?.setLoginItemSettings) {
        app.setLoginItemSettings({ openAtLogin: data.launchAtLogin });
      }
      if (changed) persist();
      return this.get();
    },
  };
}

module.exports = { createSettingsStore, DEFAULTS };
