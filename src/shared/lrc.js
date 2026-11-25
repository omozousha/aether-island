'use strict';

/**
 * Minimal, robust LRC parser used by the lyrics pipeline.
 * Supports multiple timestamps per line, [mm:ss.xx] / [mm:ss:xx], metadata
 * headers and inline enhanced timestamps (<mm:ss.xx>).
 */

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[(ar|al|ti|by|offset|length|re|ve|au|tool|encoding):/i;
const ENHANCED_TAG = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;
const MAX_LINES = 1200;

function parseStamp(minutes, seconds, fraction) {
  const mins = Number(minutes) || 0;
  const secs = Number(seconds) || 0;
  const raw = String(fraction || '');
  const frac = raw ? Number(`0.${raw}`) : 0;
  return mins * 60 + secs + frac;
}

/**
 * @param {string} raw LRC payload
 * @returns {{lines: Array<{time:number,text:string}>, plain: string[], synced: boolean}}
 */
function parseLrc(raw) {
  const source = String(raw || '').replace(/\r/g, '');
  const synced = [];
  const plain = [];

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || META_TAG.test(line)) continue;

    TIME_TAG.lastIndex = 0;
    const stamps = [];
    let match;
    let consumed = 0;
    while ((match = TIME_TAG.exec(line)) !== null) {
      stamps.push(parseStamp(match[1], match[2], match[3]));
      consumed = TIME_TAG.lastIndex;
    }

    const content = line
      .slice(stamps.length ? consumed : 0)
      .replace(ENHANCED_TAG, '')
      .trim();

    if (stamps.length) {
      for (const time of stamps) synced.push({ time, text: content });
    } else if (content) {
      plain.push(content);
    }
  }

  synced.sort((a, b) => a.time - b.time);

  const deduped = [];
  for (const item of synced) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.time === item.time && previous.text === item.text) continue;
    deduped.push(item);
    if (deduped.length >= MAX_LINES) break;
  }

  const lines = deduped.filter((item) => item.text);
  return {
    lines,
    plain: lines.length ? lines.map((item) => item.text) : plain.slice(0, MAX_LINES),
    synced: lines.length > 0,
  };
}

/**
 * Binary search for the line that should be highlighted at `seconds`.
 * @returns {number} index or -1
 */
function findActiveIndex(lines, seconds, tolerance = 0.18) {
  if (!Array.isArray(lines) || !lines.length) return -1;
  const target = Number(seconds) + tolerance;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (Number(lines[mid].time) <= target) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** Converts offset in milliseconds to seconds, clamped to a sane range. */
function offsetSeconds(offsetMs) {
  const value = Number(offsetMs) || 0;
  return Math.max(-30, Math.min(30, value / 1000));
}

module.exports = { parseLrc, findActiveIndex, offsetSeconds, parseStamp, MAX_LINES };
