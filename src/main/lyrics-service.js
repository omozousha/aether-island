'use strict';

const { parseLrc, findActiveIndex } = require('../shared/lrc');
const { findLyrics } = require('./lyrics');
const { normalizeTrackText } = require('../shared/text');

const CACHE_MAX = 40;

class LyricsService {
  constructor({ getSettings, getApiKey, onState }) {
    this.getSettings = getSettings;
    this.getApiKey = getApiKey;
    this.onState = onState;
    this.cache = new Map();
    this.currentKey = '';
    this.current = null;
    this.currentTrack = null;
    this.translation = null; // { target, byIndex: Map<number,string> }
    this.fetchTimer = null;
    this.status = 'idle'; // idle | searching | ready | error
    this.message = '';
  }

  setTrack(track) {
    if (!track || !track.title) return;
    const key = `${normalizeTrackText(track.artist)}|${normalizeTrackText(track.title)}`;
    if (key === this.currentKey) return;
    this.currentKey = key;
    this.currentTrack = track;
    this.translation = null;
    clearTimeout(this.fetchTimer);
    this.fetchTimer = setTimeout(() => this._fetch(track, key), 350);
  }

  async _fetch(track, key) {
    if (this.currentKey !== key) return;
    this.status = 'searching';
    this._emit(this.statePayload());
    try {
      const result = await this._load(track, key, false);
      if (this.currentKey !== key) return;
      this.current = result;
      this.status = 'ready';
      this.message = result.available ? '' : 'Lirik tidak ditemukan di LRCLIB';
      this._emit(this.statePayload());
    } catch (err) {
      if (this.currentKey !== key) return;
      this.current = { available: false, lines: [], plain: [] };
      this.status = 'error';
      this.message = String(err.message || err);
      this._emit(this.statePayload());
    }
  }

  async _load(track, key, force) {
    if (!force && this.cache.has(key)) {
      const cached = this.cache.get(key);
      cached.fromCache = true;
      return cached;
    }
    const result = await findLyrics({ title: track.title, artist: track.artist, album: track.album });
    if (result.error) return result;
    const parsed = parseLrc(result.syncedLyrics || result.plainLyrics || '');
    const payload = {
      available: Boolean(result.syncedLyrics || result.plainLyrics),
      lines: parsed.lines,
      plain: parsed.plain,
      synced: parsed.synced,
      source: 'lrclib',
      matchedTitle: result.trackName || track.title,
      matchedArtist: result.artistName || track.artist || '',
      fetchedAt: Date.now(),
    };
    this._evict();
    this.cache.set(key, payload);
    return payload;
  }

  _evict() {
    if (this.cache.size < CACHE_MAX) return;
    const oldest = [...this.cache.keys()].slice(0, Math.ceil(CACHE_MAX / 4));
    for (const k of oldest) this.cache.delete(k);
  }

  async refresh() {
    if (!this.currentTrack) return;
    const key = this.currentKey;
    this.cache.delete(key);
    this.translation = null;
    clearTimeout(this.fetchTimer);
    this.status = 'searching';
    this._emit(this.statePayload());
    try {
      this.current = await this._load(this.currentTrack, key, true);
      this.status = 'ready';
      this.message = this.current.available ? '' : 'Lirik tidak ditemukan di LRCLIB';
    } catch (err) {
      this.current = { available: false, lines: [], plain: [] };
      this.status = 'error';
      this.message = String(err.message || err);
    }
    this._emit(this.statePayload());
  }

  async translate(target = 'id') {
    if (!this.current || !this.current.lines.length) throw new Error('Tidak ada lirik untuk diterjemahkan.');
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('API key AI Gater belum diisi di Pengaturan.');
    const model = this.getSettings().model;
    const { complete } = require('./ai-client');
    const { buildLyricsTranslationPrompt } = require('../shared/prompts');

    if (this.translation && this.translation.target === target) return this.translation;
    const offsetMs = Number(this.getSettings().lyricsOffsetMs) || 0;
    const lines = this.current.lines.slice(0, 80).map((l) =>
      ({ ...l, time: l.time + offsetMs / 1000 }));
    const messages = buildLyricsTranslationPrompt(lines.map((l) => l.text), target);
    const { text } = await complete({ apiKey, model, messages, temperature: 0.3, maxTokens: 2400 });
    const translated = text.split('\n').map((l) => l.replace(/^\d+[.)]\s*/, '').trim());
    this.translation = { target, byIndex: new Map(lines.map((l, i) => [i, translated[i] || ''])) };
    this._emit(this.statePayload());
    return this.translation;
  }

  clearTranslation() {
    this.translation = null;
    this._emit(this.statePayload());
  }

  setOffset(ms) {
    if (this.current) {
      this.current.offsetMs = ms;
      this._emit(this.statePayload());
    }
  }

  statePayload() {
    const base = this.current || { available: false, lines: [], plain: [] };
    const settings = this.getSettings();
    return {
      ...base,
      status: this.status,
      message: this.message || '',
      offsetMs: base.offsetMs || 0,
      translation: this.translation ? { target: this.translation.target, byIndex: [...this.translation.byIndex.entries()] } : null,
      enabled: settings.lyrics !== false,
      trackKey: this.currentKey,
    };
  }

  _emit(payload) {
    try { this.onState?.(payload); } catch {}
  }

  dispose() { clearTimeout(this.fetchTimer); this.cache.clear(); }
}

module.exports = { LyricsService, findActiveIndex };
