'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MAX_ENTRIES = 60;
const MAX_LENGTH = 20000;

function createClipStore({ filePath }) {
  let entries = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) entries = parsed.filter((item) => item && typeof item.text === 'string').slice(0, MAX_ENTRIES);
  } catch { entries = []; }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {}
  }

  function add(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_LENGTH) return null;
    if (entries[0]?.text === trimmed) return null;
    const existing = entries.findIndex((entry) => entry.text === trimmed);
    if (existing >= 0) entries.splice(existing, 1);
    const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: trimmed, ts: Date.now(), kind: classify(trimmed) };
    entries.unshift(entry);
    entries = entries.slice(0, MAX_ENTRIES);
    persist();
    return entry;
  }

  function classify(text) {
    if (/^https?:\/\/\S+$/i.test(text)) return 'link';
    if (/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(text)) return 'email';
    if (/^[\d\s()+-]{8,}$/.test(text)) return 'phone';
    if (/^[{[].*[}\]]$/s.test(text) && text.length > 2) return 'code';
    if (text.length > 240) return 'text';
    return 'text';
  }

  return {
    list: () => entries.slice(),
    add,
    remove(id) { entries = entries.filter((entry) => entry.id !== id); persist(); },
    clear() { entries = []; persist(); },
    has: (text) => entries.some((entry) => entry.text === String(text || '').trim()),
    get size() { return entries.length; },
  };
}

module.exports = { createClipStore };
