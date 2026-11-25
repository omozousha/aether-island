'use strict';

const { streamComplete } = require('./ai-client');
const { buildSystemPrompt, resolveAction, listActions } = require('../shared/prompts');
const { truncate } = require('../shared/text');

const MAX_MESSAGES = 24;
const MAX_CONTEXT_CHARS = 12000;
const DELTA_FLUSH_MS = 30;
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

class AiService {
  constructor({ getSettings, getApiKey, getMedia, getSystem, getClipboard, sendDelta, sendDone, sendError }) {
    this.getSettings = getSettings;
    this.getApiKey = getApiKey;
    this.getMedia = getMedia;
    this.getSystem = getSystem;
    this.getClipboard = getClipboard;
    this.sendDelta = sendDelta;
    this.sendDone = sendDone;
    this.sendError = sendError;
    this.currentId = null;
    this.controller = null;
    this._deltaBuffer = new Map();
    this._flushTimer = null;
  }

  buildContext({ useTrack = false, useClipboard = false, useSystem = false } = {}) {
    const context = {};
    if (useTrack) {
      const media = this.getMedia();
      if (media?.active && media.title) context.track = { title: media.title, artist: media.artist, album: media.album };
    }
    if (useClipboard) {
      const clips = this.getClipboard();
      if (clips && clips.length) context.clipboard = truncate(clips[0].text, 2000);
    }
    if (useSystem) {
      const system = this.getSystem();
      if (system) context.system = { cpu: system.cpu, mem: system.mem };
    }
    return context;
  }

  chat({ id, text, history = [], context = {} }) {
    if (!id || typeof id !== 'string') return;
    this.abort(this.currentId);
    this.currentId = id;
    this.controller = new AbortController();
    this._run(id, text, history, context, this.controller.signal).catch(() => {});
  }

  async _run(id, text, history, context, signal) {
    try {
      const settings = this.getSettings();
      if (settings.aiEnabled === false) throw new Error('AI dinonaktifkan di Pengaturan.');
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('Tambahkan API key AI Gater di Pengaturan terlebih dahulu.');
      const model = settings.model || DEFAULT_MODEL;
      const systemPrompt = buildSystemPrompt({
        personality: settings.personality,
        language: settings.language || 'id',
        context,
      });

      const sanitizedHistory = (Array.isArray(history) ? history : [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
        .slice(-MAX_MESSAGES)
        .map((m) => ({ role: m.role, content: truncate(m.text, 6000) }));

      const messages = [{ role: 'system', content: systemPrompt }, ...sanitizedHistory, { role: 'user', content: truncate(text, 6000) }];
      let full = '';
      await streamComplete({
        apiKey, model, messages, signal,
        onDelta: (delta) => this._queueDelta(id, delta, () => { full += delta; }),
      });
      if (signal.aborted) return;
      this._flushDelta(id, true);
      this.sendDone({ id, text: full, usage: null });
    } catch (err) {
      if (!signal.aborted) this.sendError({ id, error: String(err.message || 'Permintaan AI gagal.') });
    } finally {
      if (this.currentId === id) { this.currentId = null; this.controller = null; }
    }
  }

  _queueDelta(id, delta, append) {
    append();
    const bucket = this._deltaBuffer.get(id) || '';
    this._deltaBuffer.set(id, bucket + delta);
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => {
        this._flushTimer = null;
        this._flushDelta(id, false);
      }, DELTA_FLUSH_MS);
    }
  }

  _flushDelta(id, final) {
    const pending = this._deltaBuffer.get(id);
    if (pending) {
      this._deltaBuffer.delete(id);
      this.sendDelta({ id, text: pending });
    } else if (final) {
      this.sendDelta({ id, text: '' });
    }
  }

  runAction({ id, actionId, text, context = {} }) {
    const resolved = resolveAction(actionId, text, context);
    if (!resolved) {
      this.sendError({ id, error: !String(text || '').trim() ? 'Tidak ada teks untuk diproses.' : 'Aksi tidak dikenal.' });
      return;
    }
    this.chat({ id, text: resolved.prompt, history: [], context });
  }

  abort(id) {
    if (this.controller && (!id || this.currentId === id)) {
      this.controller.abort();
      this.controller = null;
      this.currentId = null;
      this._deltaBuffer.clear();
    }
  }

  abortAll() {
    this.abort(null);
  }

  dispose() {
    this.abortAll();
    clearTimeout(this._flushTimer);
    this._deltaBuffer.clear();
  }
}

module.exports = { AiService, MAX_CONTEXT_CHARS, DEFAULT_MODEL };
