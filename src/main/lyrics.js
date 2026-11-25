'use strict';
const BASE = 'https://lrclib.net/api';
function normalizeTrackText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat\.?|ft\.?).*$/i, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function scoreResult(item, title, artist, album) {
  const targetTitle = normalizeTrackText(title);
  const targetArtist = normalizeTrackText(artist);
  const candidateTitle = normalizeTrackText(item.trackName);
  const candidateArtist = normalizeTrackText(item.artistName);
  let score = 0;
  if (targetTitle && candidateTitle === targetTitle) score += 7;
  else if (targetTitle && (candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle))) score += 3;
  if (targetArtist && candidateArtist === targetArtist) score += 5;
  else if (targetArtist && (candidateArtist.includes(targetArtist) || targetArtist.includes(candidateArtist))) score += 2;
  if (item.syncedLyrics) score += 2;
  if (album && normalizeTrackText(item.albumName) === normalizeTrackText(album)) score += 1;
  return score;
}
async function findLyrics({ title, artist, album }) {
  if (!title) return { syncedLyrics: '', plainLyrics: '', matchedTitle: '', matchedArtist: '' };
  const params = new URLSearchParams({ track_name: title, artist_name: artist || '' });
  if (album) params.set('album_name', album);
  let response = await fetch(`${BASE}/get?${params}`, { headers: { 'User-Agent': 'AetherIsland/1.0 (Windows desktop lyrics)' }, signal: AbortSignal.timeout(10000) });
  if (response.ok) {
    const match = await response.json();
    if (match?.syncedLyrics || match?.plainLyrics) return toPayload(match);
  }
  response = await fetch(`${BASE}/search?q=${encodeURIComponent(`${title} ${artist || ''}`)}`, {
    headers: { 'User-Agent': 'AetherIsland/1.0 (Windows desktop lyrics)' }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Pencarian lirik tidak tersedia (${response.status}).`);
  const items = await response.json();
  if (!Array.isArray(items) || !items.length) return { syncedLyrics: '', plainLyrics: '', matchedTitle: '', matchedArtist: '' };
  items.sort((a, b) => scoreResult(b, title, artist, album) - scoreResult(a, title, artist, album));
  return toPayload(items[0]);
}
function toPayload(item) {
  return { syncedLyrics: item.syncedLyrics || '', plainLyrics: item.plainLyrics || '', matchedTitle: item.trackName || '', matchedArtist: item.artistName || '' };
}
module.exports = { findLyrics, normalizeTrackText, scoreResult };
