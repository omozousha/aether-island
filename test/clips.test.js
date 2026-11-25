const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClipStore } = require('../src/main/clips');

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-')), name);
}

test('clip store add/list/clear persists', async () => {
  const file = tmpFile('clips.json');
  const store = createClipStore({ filePath: file });
  const a = store.add('hello world');
  const b = store.add('second clip');
  assert.ok(a.id && b.id && a.id !== b.id);
  let list = store.list();
  assert.equal(list.length, 2);
  store.remove(a.id);
  list = store.list();
  assert.equal(list.length, 1);
  store.clear();
  assert.equal(store.list().length, 0);
  assert.ok(fs.existsSync(file));
});
