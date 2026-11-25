'use strict';

const { desktopCapturer, screen } = require('electron');

const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 54;
const MIN_RING_PIXELS = 4;

/**
 * Samples the ring of desktop pixels OUTSIDE the window bounds and averages
 * them into two ambient colors + luminance. The window never films itself.
 */
async function sampleAmbient(win) {
  if (!win || win.isDestroyed()) return null;
  try {
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: THUMB_WIDTH, height: THUMB_HEIGHT },
      fetchWindowIcons: false,
    });
    const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (!source?.thumbnail || source.thumbnail.isEmpty()) return null;

    const image = source.thumbnail;
    const { width, height } = image.getSize();
    if (width < 2 || height < 2) return null;

    const scaleX = width / display.bounds.width;
    const scaleY = height / display.bounds.height;
    const wx = Math.round((bounds.x - display.bounds.x) * scaleX);
    const wy = Math.round((bounds.y - display.bounds.y) * scaleY);
    const ww = Math.round(bounds.width * scaleX);
    const wh = Math.round(bounds.height * scaleY);

    const buffer = image.toBitmap();
    const bpp = image.getBitmap ? 4 : 4; // BGRA on all platforms Electron supports

    const sample = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const offset = (y * width + x) * bpp;
      const b = buffer[offset];
      const g = buffer[offset + 1];
      const r = buffer[offset + 2];
      return [r, g, b];
    };

    const regions = [];
    for (let y = Math.max(0, wy - 6); y < Math.min(height, wy + wh + 6); y++) {
      for (let x = Math.max(0, wx - 6); x < Math.min(width, wx); x++) regions.push(sample(x, y));
      for (let x = Math.min(width - 1, wx + ww); x < Math.min(width, wx + ww + 6); x++) regions.push(sample(x, y));
    }
    for (let x = Math.max(0, wx - 6); x < Math.min(width, wx + ww + 6); x++) {
      for (let y = Math.max(0, wy - 6); y < Math.min(height, wy); y++) regions.push(sample(x, y));
      for (let y = Math.min(height - 1, wy + wh); y < Math.min(height, wy + wh + 6); y++) regions.push(sample(x, y));
    }
    if (regions.length < MIN_RING_PIXELS) return null;

    let sr = 0, sg = 0, sb = 0, count = 0;
    for (const px of regions) {
      if (!px) continue;
      sr += px[0]; sg += px[1]; sb += px[2]; count += 1;
    }
    if (!count) return null;
    const r = Math.round(sr / count);
    const g = Math.round(sg / count);
    const b = Math.round(sb / count);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    const shift = (value, delta) => Math.max(0, Math.min(255, Math.round(value + delta)));
    return {
      a: `rgb(${shift(r, 14)},${shift(g, 10)},${shift(b, 26)})`,
      b: `rgb(${shift(r, -10)},${shift(g, 6)},${shift(b, 16)})`,
      luminance,
      sampledAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function startAmbientLoop({ win, onSample, intervalMs = 1500 }) {
  let timer = null;
  let running = true;
  async function tick() {
    if (!running || !win || win.isDestroyed()) return;
    if (win.isVisible()) {
      const sample = await sampleAmbient(win);
      if (sample && !win.isDestroyed()) onSample?.(sample);
    }
  }
  function start() {
    timer = setInterval(tick, intervalMs);
  }
  function stop() {
    running = false;
    if (timer) clearInterval(timer);
    timer = null;
  }
  start();
  return { stop };
}

module.exports = { sampleAmbient, startAmbientLoop };
