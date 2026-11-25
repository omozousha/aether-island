const test = require('node:test');
const assert = require('node:assert/strict');
const { PERSONALITIES, buildSystemPrompt, buildLyricsTranslationPrompt } = require('../src/shared/prompts');

test('personalities exist', () => {
  assert.ok(PERSONALITIES.ringkas);
  assert.ok(PERSONALITIES.santai);
  assert.ok(PERSONALITIES.formal);
});

test('buildSystemPrompt includes personality + context', () => {
  const p = buildSystemPrompt({ personality: 'ringkas', language: 'id', context: { track: { title: 'X', artist: 'Y' } } });
  assert.ok(typeof p === 'string' && p.length > 20);
  assert.ok(p.includes('"X"'));
  assert.ok(p.includes('Y'));
});

test('translation prompt builds message array', () => {
  const messages = buildLyricsTranslationPrompt(['Hello world', 'Second line'], 'id');
  assert.ok(Array.isArray(messages));
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.ok(messages[1].content.includes('Hello world'));
  assert.ok(messages[1].content.toLowerCase().includes('indonesian'));
  assert.ok(messages[1].content.includes('2 baris'));
});
