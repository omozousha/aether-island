'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { desktopCapturer } = require('electron');

async function runSmoke({ islandWindow, setMode, summonAi, openSettings, app }) {
  const outDir = '/tmp/aether-smoke';
  fs.mkdirSync(outDir, { recursive: true });
  const summary = { consoleErrors: [], pageErrors: [], captures: [], mode: 'unknown' };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  islandWindow?.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) summary.consoleErrors.push({ level, message, source: sourceId, line });
  });

  const shoot = async (win, name) => {
    if (!win || win.isDestroyed()) return;
    try {
      const image = await win.webContents.capturePage();
      const file = path.join(outDir, `${name}.png`);
      fs.writeFileSync(file, image.toPNG());
      summary.captures.push(file);
    } catch (err) {
      summary.consoleErrors.push({ message: `capture ${name} failed: ${err.message}` });
    }
  };

  try {
    await wait(1400);
    try {
      summary.probe = await islandWindow.webContents.executeJavaScript(
        '({aether: Object.keys(window.aether||{}), settings: Object.keys((window.aether&&window.aether.settings)||{}), settingsType: typeof (window.aether&&window.aether.settings)})');
    } catch (e) { summary.probeError = String(e && e.message || e); }
    try {
      summary.domText = await islandWindow.webContents.executeJavaScript(
        '(() => { const t=document.getElementById("compactTitle"); const s=document.getElementById("compactSub"); const r=t?.getBoundingClientRect(); return {title:t?.textContent, sub:s?.textContent, rect:r&&{x:r.x,y:r.y,w:r.width,h:r.height}, color:t?getComputedStyle(t).color:null}; })()');
    } catch (e) {}
    try {
      summary.domGeom = await islandWindow.webContents.executeJavaScript(
        '(() => { const i=document.getElementById("island"); const p=document.getElementById("panel"); const c=document.getElementById("compact"); return {inner:[window.innerWidth,window.innerHeight], cls:i&&i.className, island:i&&i.getBoundingClientRect().toJSON(), panel:p&&{r:p.getBoundingClientRect().toJSON(), display:getComputedStyle(p).display}, compact:c&&{r:c.getBoundingClientRect().toJSON(), display:getComputedStyle(c).display}}; })()');
    } catch (e) {}
    await shoot(islandWindow, 'collapsed');
    setMode(islandWindow, 'expanded');
    await wait(650);
    try {
      summary.domGeomExpanded = await islandWindow.webContents.executeJavaScript(
        '(() => { const i=document.getElementById("island"); const p=document.getElementById("panel"); const c=document.getElementById("compact"); return {inner:[window.innerWidth,window.innerHeight], cls:i&&i.className, island:i&&i.getBoundingClientRect().toJSON(), panel:p&&{r:p.getBoundingClientRect().toJSON(), display:getComputedStyle(p).display}, compact:c&&{r:c.getBoundingClientRect().toJSON(), display:getComputedStyle(c).display}}; })()');
    } catch (e) {}
    await shoot(islandWindow, 'lyrics');
    try {
      summary.lyricsDom = await islandWindow.webContents.executeJavaScript(
        '(() => ({activeTab: document.querySelector(".tab.active")?.textContent, scroll: document.getElementById("lyricsScroll")?.innerText?.slice(0,300), empty: document.querySelector(".lyrics-empty")?.textContent}))()');
    } catch (e) {}

    islandWindow?.webContents.executeJavaScript('window.__debug && window.__debug.switchTab("ai")').catch(() => {});
    await wait(400);
    await shoot(islandWindow, 'ai');

    islandWindow?.webContents.executeJavaScript('window.__debug && window.__debug.switchTab("tools")').catch(() => {});
    await wait(400);
    await shoot(islandWindow, 'tools');
    try {
      summary.toolsDom = await islandWindow.webContents.executeJavaScript(
        '(() => ({gauges: [...document.querySelectorAll(".gauge")].map(g=>g.textContent), actions: document.getElementById("actionsGrid")?.children.length, clips: document.getElementById("clipsList")?.textContent.slice(0,200)}))()');
    } catch (e) { summary.toolsProbeError = String(e && e.message || e); }
    try {
      summary.aiDom = await islandWindow.webContents.executeJavaScript(
        '(() => ({chat: document.getElementById("chatScroll")?.innerText?.slice(0,400), quick: document.getElementById("quickRow")?.children.length, input: !!document.getElementById("chatInput"), send: !!document.getElementById("sendButton")}))()');
    } catch (e) {}

    summonAi();
    await wait(150);
    islandWindow?.webContents.executeJavaScript('window.__debug && window.__debug.switchTab("lyrics")').catch(() => {});
    await wait(350);

    openSettings();
    await wait(900);
    const settingsWin = islandWindow ? null : null;
    const { BrowserWindow } = require('electron');
    const settings = BrowserWindow.getAllWindows().find((w) => w !== islandWindow);
    if (settings) {
      await shoot(settings, 'settings');
      try {
        summary.settingsDom = await settings.webContents.executeJavaScript(
          '(() => ({title: document.title, apiKey: !!document.getElementById("apiKey"), model: !!document.getElementById("modelSelect"), navs: [...document.querySelectorAll("[data-section]")].map(n=>n.textContent.trim().slice(0,30))}))()');
      } catch (e) {}
    }
    else summary.consoleErrors.push({ message: 'settings window not found' });

    setMode(islandWindow, 'collapsed');
    await wait(400);
    await shoot(islandWindow, 'collapsed-final');
  } catch (err) {
    summary.pageErrors.push(String(err && err.stack ? err.stack : err));
  }

  console.log(JSON.stringify(summary, null, 2));
  setTimeout(() => app.exit(0), 250);
}

module.exports = { runSmoke };
