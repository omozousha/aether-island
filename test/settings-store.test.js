const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettingsStore } = require('../src/main/settings-store');

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-')), name);
}

test('createSettingsStore loads defaults and persists non-secret fields', () => {
  const file = tmpFile('settings.json');
  const store = createSettingsStore({ filePath: file, safeStorage: null });
  const got = store.get();
  assert.equal(got.model, 'openai/gpt-4o-mini');
  assert.equal(got.hasApiKey, false);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('apiKey'));
});

test('createSettingsStore merges stored values and coerces types', () => {
  const file = tmpFile('settings.json');
  fs.writeFileSync(file, JSON.stringify({ windowOpacity: '0.5', lyrics: 'true', model: 'x'.repeat(300) }));
  const store = createSettingsStore({ filePath: file, safeStorage: null });
  const got = store.get();
  assert.equal(got.windowOpacity, 0.5);
  assert.equal(got.lyrics, true);
  assert.ok(got.model.length <= 180);
});

test('set applies patch and broadcasts nothing but writes file', () => {
  const file = tmpFile('settings.json');
  const store = createSettingsStore({ filePath: file, safeStorage: null });
  store.set({ accent: '#00ffcc', windowBlur: 42 });
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.accent, '#00ffcc');
  assert.equal(raw.windowBlur, 42);
  assert.equal(store.get().accent, '#00ffcc');
});
