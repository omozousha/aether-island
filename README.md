# Aether Island

Widget always-on-top untuk Windows 11 bergaya Dynamic Island. Satu pill yang memuai jadi panel penuh berisi lirik tersinkron, asisten AI streaming (AI Gater), dan monitor sistem.

## Fitur

- **Island / Pill** — jendela frameless transparan, selalu di atas, hotkey global.
- **Media** — jembatan SMTC (PowerShell) membaca sesi media Windows: judul, artis, album, thumbnail, posisi/durasi, play/pause/next/prev/seek.
- **Lirik** — otomatis cari di LRCLIB saat musik diputar; sinkron per baris, klik baris = seek; offset ±ms; terjemahan via AI Gater.
- **AI Chat** — streaming token-per-token dari AI Gater (`OpenAI-compatible`), konteks lagu/clipboard/sistem, aksi cepat `/summarize`, `/translate`, `/explainCode`, `/caption`, `/plan`, `/explainSong`, `/rewrite`, `/reply`.
- **Tools** — gauge CPU/RAM/Disk/Baterai, riwayat clipboard dengan pencarian + copy + hapus.
- **Pengaturan** — API key terenkripsi (DPAPI via `safeStorage`), model, personality, bahasa, target terjemahan, aksen warna, opasitas/blur panel, launch-at-login, auto-collapse, hotkey yang bisa diubah.

## Hotkey default

| Aksi | Kombinasi |
|---|---|
| Toggle panel | `Alt+Shift+Space` |
| Asisten AI | `Alt+Shift+A` |
| Lirik | `Alt+Shift+L` |
| Sembunyikan | `Alt+Shift+H` |

## Build

Prasyarat: Node 20+, Windows 11 (SMTC & tray).

```bash
npm install
npm start                 # dev
node --test test/         # unit test
electron --no-sandbox --demo --smoke .   # smoke Xvfb (Linux)
npx electron-builder --win nsis --x64    # installer NSIS
```

Build Windows dari Linux arm64 butuh `apt-get install nsis` + wrapper `makensis` (biner x86-64) dan patch `app-builder-lib/out/targets/nsis/NsisTarget.js` (ganti pemanggilan wine dengan `UninstallerReader.exec`). Lihat catatan di `scripts/make-icons.py`.

## Struktur

```
src/main      main process: IPC, window, SMTC bridge, AI client, settings store
src/preload   contextBridge surface (window.aether, window.aetherSettings)
src/renderer  island + settings UI
src/shared    parser LRC, prompt builder, util teks
scripts       generator ikon (pure-stdlib) + skrip SMTC PowerShell
test          unit test node:test
build/        ikon .ico/.png
```

## Keamanan

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- CSP ketat; navigasi eksternal ditolak; tautan eksternal hanya lewat `shell.openExternal` setelah validasi URL.
- API key disimpan terenkripsi OS (DPAPI Windows); renderer hanya melihat `hasApiKey`.
