'use strict';

const api = window.aetherSettings;
const $ = (id) => document.getElementById(id);

const state = { apiKey: '', models: [], settings: null };
const els = {};

function cacheEls() {
  ['root','closeButton','apiKey','toggleKey','keyStatus','modelSelect','refreshModels','modelHint',
   'personality','language','aiEnabled','testConnection','testStatus','accentSwatches','windowOpacity',
   'opacityValue','windowBlur','blurValue','autoCollapse','showAlbumArt','hotkeyToggle','hotkeyAi',
   'hotkeyLyrics','hotkeyHide','saveHotkeys','hotkeyStatus','lyrics','translationTarget','lyricsOffsetMs',
   'offsetLabel','clipboardHistory','showBattery','clearClips','appVersion','platformLine','openGitHub']
    .forEach((id) => { els[id] = $(id); });
}

function setSwitch(el, on) {
  el.classList.toggle('on', Boolean(on));
  el.setAttribute('aria-checked', String(Boolean(on)));
}

function renderSettings(settings) {
  state.settings = settings;
  els.keyStatus.textContent = settings.hasApiKey ? 'key tersimpan (terenkripsi)' : 'belum ada key';
  els.keyStatus.className = `status ${settings.hasApiKey ? 'ok' : ''}`;
  els.aiEnabled.disabled = false;
  setSwitch(els.aiEnabled, settings.aiEnabled);
  setSwitch(els.autoCollapse, settings.autoCollapse);
  setSwitch(els.showAlbumArt, settings.showAlbumArt);
  setSwitch(els.lyrics, settings.lyrics);
  setSwitch(els.clipboardHistory, settings.clipboardHistory);
  setSwitch(els.showBattery, settings.showBattery);

  for (const button of els.personality.querySelectorAll('button')) button.classList.toggle('on', button.dataset.value === settings.personality);
  for (const button of els.language.querySelectorAll('button')) button.classList.toggle('on', button.dataset.value === settings.language);
  for (const button of els.translationTarget.querySelectorAll('button')) button.classList.toggle('on', button.dataset.value === settings.translationTarget);
  for (const button of els.accentSwatches.querySelectorAll('.swatch')) button.classList.toggle('on', button.dataset.value === settings.accent);

  els.windowOpacity.value = settings.windowOpacity;
  els.opacityValue.textContent = `${Math.round(settings.windowOpacity * 100)}%`;
  els.windowBlur.value = settings.windowBlur;
  els.blurValue.textContent = String(settings.windowBlur);
  els.lyricsOffsetMs.value = settings.lyricsOffsetMs;
  els.offsetLabel.textContent = `${settings.lyricsOffsetMs} ms`;

  if (document.activeElement !== els.hotkeyToggle) els.hotkeyToggle.value = settings.hotkeyToggle || '';
  if (document.activeElement !== els.hotkeyAi) els.hotkeyAi.value = settings.hotkeyAi || '';
  if (document.activeElement !== els.hotkeyLyrics) els.hotkeyLyrics.value = settings.hotkeyLyrics || '';
  if (document.activeElement !== els.hotkeyHide) els.hotkeyHide.value = settings.hotkeyHide || '';
}

async function loadModels(selectId) {
  els.refreshModels.disabled = true;
  try {
    const models = await api.models();
    state.models = models || [];
    els.modelSelect.innerHTML = '';
    if (!state.models.length) {
      els.modelSelect.innerHTML = '<option value="">tidak ada model</option>';
    } else {
      for (const model of state.models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.id;
        els.modelSelect.appendChild(option);
      }
      if (selectId && state.models.some((m) => m.id === selectId)) els.modelSelect.value = selectId;
      els.modelHint.textContent = `${state.models.length} model tersedia di AI Gater.`;
    }
  } catch (err) {
    els.modelSelect.innerHTML = '<option value="">gagal memuat</option>';
    els.modelHint.textContent = String(err.message || err).slice(0, 160);
  }
  els.refreshModels.disabled = false;
}

function init() {
  cacheEls();
  bindNav();
  bindControls();

  api.info().then((info) => {
    els.appVersion.textContent = `v${info.version}`;
    els.platformLine.textContent = `Platform ${info.platform}${info.isPackaged ? ' · packaged' : ' · dev'}`;
  });

  api.get().then(async (settings) => {
    renderSettings(settings);
    if (settings.hasApiKey) await loadModels(settings.model);
    else {
      els.modelSelect.innerHTML = '<option value="">isi API key dulu</option>';
      els.modelHint.textContent = 'Model akan dimuat setelah API key disimpan.';
    }
  });

  api.onChanged(renderSettings);
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      item.classList.add('active');
      document.querySelector(`.section[data-section="${item.dataset.section}"]`)?.classList.add('active');
    });
  });
  els.closeButton.addEventListener('click', () => api.close());
}

function bindControls() {
  els.toggleKey.addEventListener('click', () => {
    els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
  });

  els.refreshModels.addEventListener('click', () => loadModels(state.settings?.model));

  els.modelSelect.addEventListener('change', () => {
    api.set({ model: els.modelSelect.value });
  });

  els.personality.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-value]');
    if (!button) return;
    api.set({ personality: button.dataset.value });
  });

  els.language.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-value]');
    if (!button) return;
    api.set({ language: button.dataset.value });
  });

  els.translationTarget.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-value]');
    if (!button) return;
    api.set({ translationTarget: button.dataset.value });
  });

  els.accentSwatches.addEventListener('click', (e) => {
    const button = e.target.closest('.swatch');
    if (!button) return;
    api.set({ accent: button.dataset.value });
  });

  els.aiEnabled.addEventListener('click', () => api.set({ aiEnabled: !state.settings?.aiEnabled }));
  els.autoCollapse.addEventListener('click', () => api.set({ autoCollapse: !state.settings?.autoCollapse }));
  els.showAlbumArt.addEventListener('click', () => api.set({ showAlbumArt: !state.settings?.showAlbumArt }));
  els.lyrics.addEventListener('click', () => api.set({ lyrics: !state.settings?.lyrics }));
  els.clipboardHistory.addEventListener('click', () => api.set({ clipboardHistory: !state.settings?.clipboardHistory }));
  els.showBattery.addEventListener('click', () => api.set({ showBattery: !state.settings?.showBattery }));

  els.windowOpacity.addEventListener('change', () => api.set({ windowOpacity: Number(els.windowOpacity.value) }));
  els.windowOpacity.addEventListener('input', () => { els.opacityValue.textContent = `${Math.round(els.windowOpacity.value * 100)}%`; });
  els.windowBlur.addEventListener('change', () => api.set({ windowBlur: Number(els.windowBlur.value) }));
  els.windowBlur.addEventListener('input', () => { els.blurValue.textContent = els.windowBlur.value; });

  els.lyricsOffsetMs.addEventListener('input', () => { els.offsetLabel.textContent = `${els.lyricsOffsetMs.value} ms`; });
  els.lyricsOffsetMs.addEventListener('change', () => api.set({ lyricsOffsetMs: Number(els.lyricsOffsetMs.value) }));

  els.clearClips.addEventListener('click', async () => {
    try { await api.clearClips(); els.clearClips.textContent = 'Dibersihkan ✓'; }
    catch { els.clearClips.textContent = 'Gagal membersihkan'; }
    setTimeout(() => { els.clearClips.textContent = 'Kosongkan clipboard'; }, 1800);
  });

  els.openGitHub.addEventListener('click', () => {
    api.openExternal('https://github.com/aether-labs/aether-island');
  });

  els.saveHotkeys.addEventListener('click', async () => {
    els.hotkeyStatus.className = 'status';
    els.hotkeyStatus.textContent = 'menyimpan…';
    try {
      await api.set({
        hotkeyToggle: els.hotkeyToggle.value.trim(),
        hotkeyAi: els.hotkeyAi.value.trim(),
        hotkeyLyrics: els.hotkeyLyrics.value.trim(),
        hotkeyHide: els.hotkeyHide.value.trim(),
      });
      els.hotkeyStatus.className = 'status ok';
      els.hotkeyStatus.textContent = 'hotkey tersimpan';
    } catch (err) {
      els.hotkeyStatus.className = 'status err';
      els.hotkeyStatus.textContent = String(err.message || err).slice(0, 120);
    }
  });

  els.testConnection.addEventListener('click', async () => {
    const key = els.apiKey.value.trim();
    els.testStatus.className = 'status';
    els.testStatus.textContent = 'menguji…';
    try {
      const result = await api.test({ apiKey: key || undefined, model: state.settings?.model });
      els.testStatus.className = 'status ok';
      const known = result.modelKnown === false ? ' (model tidak ada di daftar)' : '';
      els.testStatus.textContent = `berhasil · model ${result.model || '-'}${known}`;
      if (key) {
        await api.set({ apiKey: key });
        els.apiKey.value = '';
        els.keyStatus.textContent = 'key tersimpan (terenkripsi)';
        els.keyStatus.className = 'status ok';
        await loadModels(state.settings?.model);
      }
    } catch (err) {
      els.testStatus.className = 'status err';
      els.testStatus.textContent = String(err.message || err).slice(0, 140);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
