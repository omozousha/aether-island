const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLrc, findActiveIndex, MAX_LINES } = require('../src/shared/lrc');

function synced(raw) {
  return parseLrc(raw).lines;
}

test('parseLrc parses timestamped lines', () => {
  const lrc = '[00:01.50]Hello\n[00:03.20]World\n[01:00]End';
  const lines = synced(lrc);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].time, 1.5);
  assert.equal(lines[0].text, 'Hello');
  assert.equal(lines[1].time, 3.2);
  assert.equal(lines[2].time, 60);
});

test('parseLrc skips metadata tags and malformed lines', () => {
  const lines = synced('[ti:Song]\n[ar:Artist]\n[by:me]\nnot a lyric\n[00:01.00]Line');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'Line');
});

test('parseLrc handles enhanced word tags (strips them)', () => {
  const lines = synced('[00:05.00]<00:05.00>Word <00:05.50>after');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'Word after');
});

test('parseLrc caps at MAX_LINES', () => {
  const many = Array.from({ length: MAX_LINES + 100 }, (_, i) => `[00:${String(i % 60).padStart(2, '0')}.${String(i % 100).padStart(2, '0')}]L${i}`).join('\n');
  const parsed = parseLrc(many);
  assert.ok(parsed.lines.length <= MAX_LINES);
  assert.equal(parsed.synced, true);
});

test('findActiveIndex picks current and previous line', () => {
  const lines = synced('[00:00.00]A\n[00:04.00]B\n[00:08.00]C');
  assert.equal(findActiveIndex(lines, 2), 0);
  assert.equal(findActiveIndex(lines, 5), 1);
  assert.equal(findActiveIndex(lines, 9), 2);
  assert.equal(findActiveIndex(lines, 0), 0);
  assert.equal(findActiveIndex(lines, -1), -1);
});
