'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');

const DEMO_TRACKS = [
  { title: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", duration: 243000 },
  { title: 'Sunset Lover', artist: 'Petit Biscuit', album: 'Presence', duration: 238000 },
  { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', duration: 258000 },
];

class MediaBridge extends EventEmitter {
  constructor({ scriptsDir, powershell = 'powershell.exe', demo = false }) {
    super();
    this.scriptsDir = scriptsDir;
    this.powershell = powershell;
    this.demo = demo || process.platform !== 'win32';
    this.state = { active: false, ok: true, status: 0, position: 0, duration: 0, title: '', artist: '', album: '', app: '', canNext: false, canPrev: false, canSeek: false, art: '' };
    this.poller = null;
    this.controller = null;
    this.restarts = 0;
    this.stopped = false;
    this.demoIndex = 0;
    this.demoTimer = null;
    this.demoStatus = 4;
    this.artCache = new Map();
  }

  start() {
    this.stopped = false;
    if (this.demo) { this.startDemo(); return; }
    this.spawnPoller();
    this.spawnController();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.demoTimer);
    try { this.poller?.kill(); } catch {}
    try { this.controller?.kill(); } catch {}
    this.poller = null;
    this.controller = null;
  }

  spawnPoller() {
    const script = path.join(this.scriptsDir, 'smtc-poll.ps1');
    if (!fs.existsSync(script)) { this.fail('Skrip media tidak ditemukan.'); return; }
    this.poller = spawn(this.powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = readline.createInterface({ input: this.poller.stdout, crlfDelay: Infinity });
    lines.on('line', (line) => this.onLine(line));
    this.poller.on('error', (error) => this.fail(`Media bridge gagal dijalankan: ${error.message}`));
    this.poller.on('close', (code) => {
      this.poller = null;
      if (this.stopped) return;
      if (this.restarts < 3) { this.restarts += 1; setTimeout(() => { if (!this.stopped) this.spawnPoller(); }, 4000); }
      else this.fail('Media bridge berhenti. Mulai ulang Aether Island.');
    });
  }

  spawnController() {
    const script = path.join(this.scriptsDir, 'smtc-control.ps1');
    if (!fs.existsSync(script)) return;
    this.controller = spawn(this.powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    this.controller.on('error', () => { this.controller = null; });
    this.controller.on('close', () => { this.controller = null; });
  }

  onLine(line) {
    let payload;
    try { payload = JSON.parse(line); } catch { return; }
    if (payload.ready) { this.emit('ready'); return; }
    if (!payload.ok) { this.fail(payload.error || 'Media session tidak tersedia.'); return; }
    this.restarts = 0;
    const previousKey = this.state.key;
    const key = payload.key || `${payload.artist}|${payload.title}`;
    const next = { ...this.state, ...payload, ok: true };
    if (payload.art) { this.artCache.set(key, payload.art); next.artKey = key; }
    else if (key && this.artCache.has(key)) { next.art = this.artCache.get(key); next.artKey = key; }
    else { next.art = ''; next.artKey = ''; }
    if (!payload.active) { next.title = ''; next.artist = ''; next.album = ''; next.duration = 0; next.position = 0; next.active = false; }
    if (previousKey && key && previousKey !== key) this.emit('track', next);
    this.state = next;
    this.emit('state', this.state);
  }

  fail(message) {
    this.state = { ...this.state, ok: false, active: false, error: message };
    this.emit('state', this.state);
  }

  snapshot() {
    return this.state;
  }

  command(action, position) {
    if (!['toggle', 'play', 'pause', 'next', 'previous', 'seek'].includes(action)) return;
    if (this.demo) { this.demoCommand(action, position); return; }
    if (!this.controller || this.controller.killed) { this.spawnController(); return; }
    const command = { action };
    if (action === 'seek' && Number.isFinite(position)) command.position = Math.max(0, Math.floor(position));
    try { this.controller.stdin.write(`${JSON.stringify(command)}\n`); } catch {}
  }

  startDemo() {
    const track = DEMO_TRACKS[0];
    this.state = { ...this.state, active: true, ok: true, key: `${track.artist}|${track.title}`, title: track.title, artist: track.artist, album: track.album, duration: track.duration, position: 42000, status: this.demoStatus, app: 'chrome.exe', canNext: true, canPrev: true, canSeek: true };
    this.emit('state', this.state);
    this.emit('track', this.state);
    clearInterval(this.demoTimer);
    this.demoTimer = setInterval(() => {
      if (this.demoStatus === 4) {
        this.state.position = Math.min(this.state.duration, this.state.position + 500);
        if (this.state.position >= this.state.duration) this.demoCommand('next');
      }
      this.emit('state', this.state);
    }, 500);
  }

  demoCommand(action, position) {
    if (action === 'toggle') this.demoStatus = this.demoStatus === 4 ? 5 : 4;
    if (action === 'play') this.demoStatus = 4;
    if (action === 'pause') this.demoStatus = 5;
    if (action === 'next' || action === 'previous') {
      this.demoIndex = (this.demoIndex + (action === 'next' ? 1 : DEMO_TRACKS.length - 1)) % DEMO_TRACKS.length;
      const track = DEMO_TRACKS[this.demoIndex];
      this.state = { ...this.state, key: `${track.artist}|${track.title}`, title: track.title, artist: track.artist, album: track.album, duration: track.duration, position: 0 };
      this.emit('track', this.state);
    }
    if (action === 'seek' && Number.isFinite(position)) this.state.position = Math.max(0, Math.min(this.state.duration, position));
    this.state.status = this.demoStatus;
    this.emit('state', this.state);
  }
}

module.exports = { MediaBridge };
