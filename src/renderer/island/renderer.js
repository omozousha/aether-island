'use strict';

const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const fmtTime = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const api = window.aether;

let settings = { accent: '#9f84ff', translationTarget: 'off', model: '', hasApiKey: false, lyricsOffsetMs: 0, clipboardHistory: true };
let media = { active: false, status: 'stopped', title: '', artist: '', album: '', appLabel: '', position: 0, duration: 0, canNext: false, canPrev: false, art: '', artKey: '' };
let lyrics = { status: 'idle', lines: [], plain: '', source: '', message: '' };
let translations = new Map();
let clips = [];
let activeTab = 'lyrics';
let context = { track: true, clipboard: false, system: false };
let chatting = false;
let history = [];

const els = {};

/* ---------- init ---------- */
function cacheEls() {
  ['island','compact','expandButton','compactArt','compactOrb','compactCopy','compactTitle','compactSub',
   'compactPrev','compactPlay','compactNext','compactAi','compactFill','panel','statusBadge','settingsButton',
   'collapseButton','mediaCard','mediaArt','panelArt','panelEyebrow','panelTitle','panelArtist','seek','elapsed',
   'duration','modelPill','viewLyrics','viewAi','viewTools','offsetMinus','offsetPlus','offsetValue','translateButton',
   'refreshLyrics','lyricsScroll','lyricsFoot','ctxTrack','ctxClipboard','ctxSystem','chatScroll','quickRow',
   'composer','chatInput','sendButton','stopButton','gCpu','gMem','gDisk','gBat','actionsGrid','clipSearch',
   'clipClear','clipsList','sysNote'].forEach((id) => { els[id] = $(id); });
}

function init() {
  cacheEls();
  bindEvents();
  api.media.onState((payload) => { media = payload; renderMedia(); });
  api.media.onTrack?.(() => {});
  api.lyrics.onState((payload) => { lyrics = payload; renderLyrics(); });
  api.ai.onDelta(handleAiDelta);
  api.ai.onDone(handleAiDone);
  api.ai.onError(handleAiError);
  api.clips?.onUpdate?.((list) => { clips = list || []; renderClips(); });
  api.settings.onChanged((s) => { settings = s; applySettings(); });
  api.win.onMode?.((mode) => {
    if (mode === 'expanded') { els.island.classList.add('expanded'); els.panel.setAttribute('aria-hidden','false'); }
    else { els.island.classList.remove('expanded'); els.panel.setAttribute('aria-hidden','true'); }
  });
  api.glass?.onAmbient?.(applyAmbient);
  api.app.onCommand?.(handleCommand);
  renderActions();
  renderQuick();
  setTab('lyrics');
  api.settings.get().then((s) => { settings = s; applySettings(); });
  api.app.info().then((info) => {
    els.modelPill.textContent = info.model || '—';
    els.modelPill.title = `Model AI Gater: ${info.model}`;
  });
  refreshSystem();
  setInterval(refreshSystem, 5000);
  setInterval(() => { if (activeTab === 'lyrics') updateActiveLine(); }, 500);
  api.media.state().then((s) => { if (s) { media = s; renderMedia(); } });
  if (window.__demoPoll) window.__demoPoll();
}

/* ---------- mode ---------- */
function setMode(mode) {
  api.win.mode(mode);
  if (mode === 'expanded') {
    els.island.classList.add('expanded');
    els.panel.setAttribute('aria-hidden', 'false');
  } else {
    els.island.classList.remove('expanded');
    els.panel.setAttribute('aria-hidden', 'true');
  }
}

function handleCommand(cmd) {
  if (cmd === 'ai' || cmd === 'ai-tab') { setMode('expanded'); setTab('ai'); els.chatInput.focus(); }
  if (cmd === 'lyrics' || cmd === 'lyrics-tab') { setMode('expanded'); setTab('lyrics'); }
  if (cmd === 'tools' || cmd === 'tools-tab') { setMode('expanded'); setTab('tools'); }
}

/* ---------- media ---------- */
function renderMedia() {
  const playing = media.status === 'playing';
  els.compactTitle.textContent = media.title || 'Halo, BOZ';
  els.compactSub.textContent = media.active ? (media.artist || media.appLabel || 'Musik') : 'AI & lirik siap';
  els.compactPlay.classList.toggle('playing', playing);
  els.panelTitle.textContent = media.title || 'Tak ada yang diputar';
  els.panelArtist.textContent = media.active ? [media.artist, media.album].filter(Boolean).join(' — ') : 'Mulai musik di browser atau Spotify';
  els.panelEyebrow.textContent = media.active ? `SEKARANG DIPUTAR · ${media.appLabel}` : 'SEKARANG DIPUTAR';
  if (media.art && media.artKey) {
    els.compactArt.src = media.art; els.compactArt.hidden = false;
    els.panelArt.src = media.art; els.panelArt.hidden = false;
  } else {
    els.compactArt.hidden = true; els.panelArt.hidden = true;
  }
  els.compactPrev.disabled = !media.canPrev;
  els.compactNext.disabled = !media.canNext;
  const dur = media.duration || 0;
  els.seek.max = Math.max(1, Math.round(dur));
  els.seek.value = Math.round(clamp(media.position || 0, 0, dur));
  els.elapsed.textContent = fmtTime(media.position);
  els.duration.textContent = fmtTime(dur);
  const pct = dur > 0 ? clamp(((media.position / dur) * 100), 0, 100) : 0;
  els.compactFill.style.width = `${pct}%`;
}

/* ---------- lyrics ---------- */
function renderLyrics() {
  const scroll = els.lyricsScroll;
  scroll.innerHTML = '';
  if (lyrics.status === 'idle' || (!lyrics.lines?.length && !lyrics.plain)) {
    scroll.innerHTML = `<div class="lyrics-empty"><span class="glyph">♫</span><p>${escapeHtml(lyrics.message || 'Lirik muncul otomatis saat musik diputar')}</p><small>Chrome · Edge · Spotify · YouTube Music</small></div>`;
    els.lyricsFoot.textContent = 'Powered by LRCLIB';
    return;
  }
  if (lyrics.status === 'searching') {
    scroll.innerHTML = `<div class="lyrics-empty"><span class="glyph">♫</span><p>Mencari lirik…</p></div>`;
    return;
  }
  if (lyrics.status === 'error') {
    scroll.innerHTML = `<div class="lyrics-empty"><span class="glyph">⚠</span><p>${escapeHtml(lyrics.message || 'Lirik tidak ditemukan')}</p></div>`;
    return;
  }
  if (lyrics.lines?.length) {
    lyrics.lines.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'lyrics-line';
      row.dataset.index = i;
      row.textContent = line.text;
      const tr = translations.get(i);
      if (tr) { const t = document.createElement('span'); t.className = 'translation'; t.textContent = tr; row.appendChild(t); row.classList.add('translated'); }
      row.addEventListener('click', () => seekToLine(i));
      scroll.appendChild(row);
    });
  } else if (lyrics.plain) {
    lyrics.plain.split('\n').forEach((t) => {
      const row = document.createElement('div');
      row.className = 'lyrics-line';
      row.textContent = t;
      scroll.appendChild(row);
    });
  }
  const src = lyrics.source === 'lrclib' ? 'LRCLIB' : lyrics.source === 'cache' ? 'CACHE' : lyrics.source || 'LRCLIB';
  els.lyricsFoot.textContent = `Powered by ${src}${lyrics.provider ? ' · ' + lyrics.provider : ''}`;
  updateActiveLine();
}

function computeActiveIndex() {
  const lines = lyrics.lines || [];
  if (!lines.length) return null;
  const seconds = (media.position || 0) / 1000 + (settings.lyricsOffsetMs || 0) / 1000;
  let active = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (Number.isFinite(lines[i].time) && lines[i].time <= seconds) active = i;
    else break;
  }
  return active;
}

function updateActiveLine() {
  const rows = els.lyricsScroll.querySelectorAll('.lyrics-line');
  if (!rows.length) return;
  rows.forEach((r) => r.classList.remove('active'));
  const idx = computeActiveIndex();
  if (Number.isInteger(idx) && rows[idx]) {
    rows[idx].classList.add('active');
    const top = rows[idx].offsetTop - els.lyricsScroll.clientHeight / 2 + rows[idx].clientHeight / 2;
    els.lyricsScroll.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}

function seekToLine(i) {
  const line = lyrics.lines?.[i];
  if (!line || !Number.isFinite(line.time)) return;
  if (!media.active || !media.canSeek) { toast('Media tidak bisa di-seek dari jendela ini'); return; }
  api.media.command('seek', Math.max(0, line.time * 1000));
}

async function translateLyrics() {
  if (settings.translationTarget === 'off') { toast('Terjemahan dimatikan di pengaturan'); return; }
  els.translateButton.textContent = '⏳ …';
  try {
    const res = await api.lyrics.translate(settings.translationTarget);
    translations = new Map(Object.entries(res.byIndex || {}));
    renderLyrics();
  } catch (e) { toast(e.message || 'Gagal menerjemahkan'); }
  els.translateButton.textContent = '⇄ Terjemah';
}

/* ---------- AI chat ---------- */
function pushMessage(role, text, opts = {}) {
  const el = document.createElement('div');
  el.className = `chat-message ${role}`;
  if (opts.id) el.dataset.id = opts.id;
  el.textContent = text;
  els.chatScroll.appendChild(el);
  els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  return el;
}

function handleAiDelta({ id, text }) {
  let el = els.chatScroll.querySelector(`[data-id="${id}"]`);
  if (!el) el = pushMessage('assistant', '', { id });
  el.textContent += text;
  els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
}

function handleAiDone({ id }) {
  const el = els.chatScroll.querySelector(`[data-id="${id}"]`);
  if (el) {
    history.push({ role: 'assistant', content: el.textContent });
    if (history.length > 24) history = history.slice(-24);
  }
  chatting = false;
  els.sendButton.hidden = false;
  els.stopButton.hidden = true;
}

function handleAiError({ id, message }) {
  const el = els.chatScroll.querySelector(`[data-id="${id}"]`);
  if (el) { el.classList.add('error'); el.textContent = `⚠ ${message}`; }
  else pushMessage('error', `⚠ ${message}`);
  chatting = false;
  els.sendButton.hidden = false;
  els.stopButton.hidden = true;
}

async function sendChat() {
  const text = els.chatInput.value.trim();
  if (!text || chatting) return;
  if (!settings.hasApiKey) { toast('Isi API key AI Gater di pengaturan dulu'); return; }
  chatting = true;
  els.sendButton.hidden = true;
  els.stopButton.hidden = false;
  els.chatInput.value = '';
  els.chatInput.style.height = 'auto';
  pushMessage('user', text);
  history.push({ role: 'user', content: text });
  await api.ai.chat({ id: `ai-${Date.now().toString(36)}`, text, history: history.slice(-24), context, actionId: detectActionId(text) });
}

function detectActionId(text) {
  const m = text.match(/^\/(\w+)/);
  return m ? m[1] : null;
}

function renderQuick() {
  const quick = [
    { label: 'Ringkas clipboard', text: '/ringkas clipboard berikut' },
    { label: 'Jelaskan lagu ini', text: '/jelaskan lagu ini' },
    { label: 'Ide caption', text: '/caption untuk lagu ini' },
    { label: 'Terjemah lirik', text: '/terjemah lirik' },
  ];
  els.quickRow.innerHTML = '';
  quick.forEach((q) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = q.label;
    b.addEventListener('click', () => { els.chatInput.value = q.text; sendChat(); });
    els.quickRow.appendChild(b);
  });
}

/* ---------- tools ---------- */
const DEFAULT_ACTIONS = [
  { id: 'summarize', label: 'Ringkas teks' },
  { id: 'translate', label: 'Terjemahkan' },
  { id: 'explain', label: 'Jelaskan' },
  { id: 'caption', label: 'Buat caption' },
  { id: 'fix', label: 'Perbaiki teks' },
  { id: 'draft', label: 'Draft pesan' },
];

function renderActions() {
  const icons = { summarize: '✎', translate: '⇄', explain: '?', caption: '✦', fix: '✚', draft: '✉' };
  els.actionsGrid.innerHTML = '';
  (window.__AETHER_ACTIONS || DEFAULT_ACTIONS).forEach((a) => {
    const b = document.createElement('button');
    b.className = 'action-tile';
    b.innerHTML = `<span class="a-glyph">${icons[a.id] || '◈'}</span><span>${escapeHtml(a.label)}</span>`;
    b.addEventListener('click', () => { setMode('expanded'); setTab('ai'); els.chatInput.value = `/${a.id} `; els.chatInput.focus(); });
    els.actionsGrid.appendChild(b);
  });
}

async function refreshSystem() {
  try {
    const s = await api.system.snapshot();
    const cpu = Math.round(Number(s.cpu?.percent ?? s.cpu ?? 0)) || 0;
    const mem = Math.round(Number(s.mem?.percent ?? s.mem ?? 0)) || 0;
    const disk = Math.round(Number(s.disk?.percent ?? s.disk ?? 0)) || 0;
    const batPct = s.battery?.percent;
    const charging = !!s.battery?.charging;
    setGauge('gCpu', cpu, cpu > 85 ? 'crit' : cpu > 60 ? 'warn' : '');
    setGauge('gMem', mem, mem > 85 ? 'crit' : mem > 65 ? 'warn' : '');
    setGauge('gDisk', disk, disk > 90 ? 'crit' : disk > 75 ? 'warn' : '');
    setGauge('gBat', batPct ?? 0, !s.battery?.hasBattery ? '' : (batPct < 20 ? 'crit' : batPct < 40 ? 'warn' : ''));
    const gb = s.mem?.total ? Math.round(s.mem.total / 1073741824) : null;
    els.sysNote.textContent = `${s.cores ?? s.cpuCores ?? '?'} core · ${gb ? gb + ' GB RAM' : 'RAM —'} · ${!s.battery?.hasBattery ? 'AC/none' : charging ? 'charging' : 'bat ' + Math.round(batPct) + '%'}`;
  } catch {}
}

function setGauge(id, pct, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = Number.isFinite(pct) ? `${Math.round(pct)}%` : '—';
  const gauge = el.closest('.gauge');
  if (gauge) {
    gauge.classList.remove('warn', 'crit');
    if (cls) gauge.classList.add(cls);
    const fill = gauge.querySelector('.g-fill');
    if (fill) fill.style.strokeDashoffset = 113 - (113 * clamp(pct || 0, 0, 100)) / 100;
  }
}

function renderClips() {
  const q = (els.clipSearch.value || '').toLowerCase();
  const list = clips.filter((c) => !q || c.text.toLowerCase().includes(q));
  els.clipsList.innerHTML = '';
  if (!list.length) { els.clipsList.innerHTML = '<div class="clips-empty">Belum ada clipboard</div>'; return; }
  list.slice(-30).reverse().forEach((c) => {
    const row = document.createElement('div');
    row.className = 'clip-item';
    row.innerHTML = `<span class="c-kind">${escapeHtml(c.kind)}</span><span class="c-text">${escapeHtml(c.text)}</span><button class="c-del" title="Hapus">✕</button>`;
    row.querySelector('.c-text').addEventListener('click', () => { api.clips.copy(c.text); toast('Tersalin'); });
    row.querySelector('.c-del').addEventListener('click', async (e) => { e.stopPropagation(); clips = await api.clips.remove(c.id); renderClips(); });
    els.clipsList.appendChild(row);
  });
}

/* ---------- ambient ---------- */
function applyAmbient(sample) {
  if (!sample) return;
  const r = document.documentElement.style;
  r.setProperty('--ambient-a', sample.a || 'rgb(120,100,220)');
  r.setProperty('--ambient-b', sample.b || 'rgb(70,180,200)');
}

/* ---------- settings apply ---------- */
function applySettings() {
  document.documentElement.style.setProperty('--accent', settings.accent || '#9f84ff');
  els.modelPill.textContent = settings.model || '—';
  els.offsetValue.textContent = `${((settings.lyricsOffsetMs || 0) / 1000).toFixed(1)}s`;
  els.ctxTrack.classList.toggle('on', !!context.track);
  els.ctxClipboard.classList.toggle('on', !!context.clipboard);
  els.ctxSystem.classList.toggle('on', !!context.system);
  const badge = els.statusBadge;
  if (settings.hasApiKey) { badge.classList.remove('off'); badge.querySelector('span').textContent = 'SIAP'; }
  else { badge.classList.add('off'); badge.querySelector('span').textContent = 'NO API KEY'; }
}

/* ---------- events ---------- */
function bindEvents() {
  els.expandButton.addEventListener('click', () => setMode('expanded'));
  els.compactCopy.addEventListener('click', () => setMode('expanded'));
  els.collapseButton.addEventListener('click', () => setMode('collapsed'));
  els.compactAi.addEventListener('click', () => { setMode('expanded'); setTab('ai'); els.chatInput.focus(); });
  els.settingsButton.addEventListener('click', () => api.win.settings());
  els.compactPlay.addEventListener('click', () => api.media.command(media.status === 'playing' ? 'pause' : 'play'));
  els.compactNext.addEventListener('click', () => api.media.command('next'));
  els.compactPrev.addEventListener('click', () => api.media.command('previous'));
  els.seek.addEventListener('change', () => api.media.command('seek', Number(els.seek.value)));
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  els.offsetMinus.addEventListener('click', () => adjustOffset(-500));
  els.offsetPlus.addEventListener('click', () => adjustOffset(500));
  els.translateButton.addEventListener('click', translateLyrics);
  els.refreshLyrics.addEventListener('click', () => api.lyrics.refresh());
  els.ctxTrack.addEventListener('click', () => { context.track = !context.track; applySettings(); });
  els.ctxClipboard.addEventListener('click', () => { context.clipboard = !context.clipboard; applySettings(); });
  els.ctxSystem.addEventListener('click', () => { context.system = !context.system; applySettings(); });
  els.composer.addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
  els.stopButton.addEventListener('click', () => api.ai.abort('current'));
  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  els.chatInput.addEventListener('input', () => {
    els.chatInput.style.height = 'auto';
    els.chatInput.style.height = Math.min(els.chatInput.scrollHeight, 96) + 'px';
  });
  els.clipSearch.addEventListener('input', renderClips);
  els.clipClear.addEventListener('click', async () => { clips = await api.clips.clear(); renderClips(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMode('collapsed');
  });
}

function adjustOffset(delta) {
  const next = clamp((settings.lyricsOffsetMs || 0) + delta, -5000, 5000);
  settings.lyricsOffsetMs = next;
  api.settings.set({ lyricsOffsetMs: next });
  applySettings();
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  els.viewLyrics.hidden = tab !== 'lyrics';
  els.viewAi.hidden = tab !== 'ai';
  els.viewTools.hidden = tab !== 'tools';
  if (tab === 'tools') { refreshSystem(); renderClips(); }
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

window.__debug = { switchTab: setTab, setMode };

document.addEventListener('DOMContentLoaded', init);
