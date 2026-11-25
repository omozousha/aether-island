'use strict';

/**
 * AI Gater — OpenAI-compatible client (main process only).
 * Base URL stays in one constant; auth is a plain Bearer header.
 */

const API_BASE = 'https://api.aigate.shop/v1';
const DEFAULT_TIMEOUT_MS = 30000;

function authHeaders(apiKey, extra = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function combinedSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT_MS);
  if (signal && typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  return signal || timeout;
}

function parseError(response, body) {
  const message = body?.error?.message || body?.message || `Permintaan AI Gater gagal (${response.status}).`;
  return new Error(String(message).slice(0, 500));
}

async function requestJson({ apiKey, path, method = 'GET', body, signal, timeoutMs }) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders(apiKey),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: combinedSignal(signal, timeoutMs),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw parseError(response, parsed);
  return parsed;
}

async function listModels(apiKey) {
  const body = await requestJson({ apiKey, path: '/models', timeoutMs: 15000 });
  const models = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
  return models
    .map((item) => ({
      id: String(item.id || item.name || ''),
      name: String(item.name || item.id || ''),
      ownedBy: String(item.owned_by || ''),
    }))
    .filter((item) => item.id)
    .slice(0, 500);
}

async function complete({ apiKey, model, messages, temperature = 0.7, maxTokens = 1800, signal }) {
  if (!apiKey) throw new Error('Tambahkan API key AI Gater di Pengaturan terlebih dahulu.');
  const body = await requestJson({
    apiKey,
    path: '/chat/completions',
    method: 'POST',
    body: { model, messages, temperature, max_tokens: maxTokens },
    signal,
    timeoutMs: 90000,
  });
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI Gater tidak mengembalikan jawaban teks.');
  return { text: text.trim(), usage: body?.usage || null };
}

async function streamComplete({ apiKey, model, messages, temperature = 0.7, maxTokens = 1800, signal, onDelta }) {
  if (!apiKey) throw new Error('Tambahkan API key AI Gater di Pengaturan terlebih dahulu.');
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(apiKey, { Accept: 'text/event-stream' }),
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true }),
    signal: combinedSignal(signal, 120000),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw parseError(response, parsed);
  if (!response.body) throw new Error('Streaming AI Gater tidak tersedia.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';

  const emitDelta = (chunk) => {
    if (typeof chunk === 'string' && chunk) {
      finalText += chunk;
      onDelta?.(chunk);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        let chunk;
        try { chunk = JSON.parse(raw); } catch { continue; }
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (Array.isArray(delta)) {
          for (const part of delta) {
            if (part && typeof part.text === 'string') emitDelta(part.text);
            else if (typeof part === 'string') emitDelta(part);
          }
        } else {
          emitDelta(delta);
        }
      }
    }
  }
  if (!finalText.trim()) throw new Error('AI Gater mengembalikan jawaban kosong.');
  return { text: finalText.trim(), usage: null };
}

async function testConnection({ apiKey, model }) {
  if (!apiKey) throw new Error('API key belum diisi.');
  const models = await listModels(apiKey).catch(() => null);
  const result = { model: model || null, models: null, ok: true };
  if (models && models.length) result.models = models.slice(0, 4).map((item) => item.id);
  if (model && models) result.modelKnown = models.some((item) => item.id === model);
  return result;
}

module.exports = { API_BASE, listModels, complete, streamComplete, testConnection };
