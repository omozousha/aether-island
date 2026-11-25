const test = require('node:test');
const assert = require('node:assert/strict');
const { clamp, formatTime, formatBytes, truncate, normalizeTrackText } = require('../src/shared/text');

test('clamp bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('formatTime takes milliseconds', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(59000), '0:59');
  assert.equal(formatTime(61000), '1:01');
  assert.equal(formatTime(3661000), '1:01:01');
  assert.equal(formatTime(3661000, { hours: true }), '1:01:01');
  assert.equal(formatTime(NaN), '0:00');
});

test('formatBytes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
});

test('truncate keeps short text, ellipsizes long text', () => {
  assert.equal(truncate('hello', 10), 'hello');
  const cut = truncate('hello world', 8);
  assert.ok(cut.length <= 8);
  assert.ok(cut.endsWith('\u2026'));
});

test('normalizeTrackText normalizes for fuzzy matching', () => {
  assert.equal(normalizeTrackText('Song (Official Video)'), 'song');
  assert.equal(normalizeTrackText('Artist - Title'), 'artist title');
  assert.equal(normalizeTrackText('  Spaced  '), 'spaced');
  assert.equal(normalizeTrackText('Band feat. Guest'), 'band');
});
