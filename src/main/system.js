'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const CACHE_TTL = 1000 * 60 * 60 * 12;

function createSystemMonitor({ cacheFile }) {
  let lastCpu = sampleCpu();
  let battery = { hasBattery: false, percent: null, charging: false };
  let batteryAt = 0;
  let disk = { total: 0, free: 0 };
  let diskAt = 0;

  function sampleCpu() {
    return osCpus().map((cpu) => cpu.times);
  }
  function osCpus() {
    return require('node:os').cpus();
  }

  function cpuPercent() {
    const current = sampleCpu();
    let idle = 0;
    let total = 0;
    for (let i = 0; i < current.length && i < lastCpu.length; i++) {
      const prev = lastCpu[i];
      const next = current[i];
      const idleDelta = next.idle - prev.idle;
      const totalDelta = Object.values(next).reduce((a, b) => a + b, 0) - Object.values(prev).reduce((a, b) => a + b, 0);
      idle += idleDelta;
      total += totalDelta;
    }
    lastCpu = current;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
  }

  function diskUsage() {
    if (Date.now() - diskAt < 30000 && disk.total) return disk;
    diskAt = Date.now();
    try {
      const target = process.platform === 'win32' ? 'C:\\' : '/';
      const stats = fs.statfsSync(target);
      disk = { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize };
    } catch { disk = { total: 0, free: 0 }; }
    return disk;
  }

  function readBattery() {
    if (process.platform !== 'win32') return Promise.resolve(battery);
    if (Date.now() - batteryAt < 60000) return Promise.resolve(battery);
    batteryAt = Date.now();
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        "Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress"],
      { timeout: 5000, windowsHide: true }, (error, stdout) => {
        if (error || !stdout.trim()) { resolve(battery); return; }
        try {
          const parsed = JSON.parse(stdout.trim());
          battery = { hasBattery: true, percent: Number(parsed.EstimatedChargeRemaining) || 0, charging: Number(parsed.BatteryStatus) === 2 };
        } catch {}
        resolve(battery);
      });
    });
  }

  async function snapshot() {
    const os = require('node:os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const used = totalMem - freeMem;
    const diskInfo = diskUsage();
    const batteryInfo = await readBattery();
    const payload = {
      cpu: cpuPercent(),
      mem: { total: totalMem, used, percent: Math.round((used / totalMem) * 100) },
      disk: { total: diskInfo.total, free: diskInfo.free, percent: diskInfo.total ? Math.round(((diskInfo.total - diskInfo.free) / diskInfo.total) * 100) : 0 },
      battery: batteryInfo,
      uptime: os.uptime(),
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      cores: os.cpus().length,
      load: os.loadavg()[0],
      sampledAt: Date.now(),
    };
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify({ cpu: payload.cpu, mem: payload.mem.percent, at: payload.sampledAt }));
    } catch {}
    return payload;
  }

  return { snapshot, cpuPercent };
}

module.exports = { createSystemMonitor };
