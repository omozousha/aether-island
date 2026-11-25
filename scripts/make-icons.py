#!/usr/bin/env python3
"""Generate Aether Island icon set (PNG + ICO) with a pure-stdlib PNG writer."""
import os
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
W, H = 256, 256

def png_chunk(tag: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

def write_png(path: Path, w: int, h: int, rows: list) -> None:
    raw = b"".join(b"\x00" + row for row in rows)
    data = b"\x89PNG\r\n\x1a\n"
    data += png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += png_chunk(b"IDAT", zlib.compress(raw, 9))
    data += png_chunk(b"IEND", b"")
    path.write_bytes(data)

def in_round_rect(x, y, x0, y0, x1, y1, r):
    """True if (x,y) is inside a rounded rectangle."""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def px(x: int, y: int):
    """Aether island icon: rounded square, violet gradient, glowing orb + glass pill."""
    if not in_round_rect(x, y, 0, 0, W - 1, H - 1, 58):
        return (0, 0, 0, 0)
    t = y / H
    base = (int(16 + 30 * t), int(14 + 22 * t), int(36 + 52 * t))
    # violet orb (upper-left glow)
    d = ((x - 92) ** 2 + (y - 92) ** 2) ** 0.5
    if d < 78:
        a = (1.0 - d / 78) ** 1.6
        orb = (159, 132, 255)
        base = tuple(min(255, int(base[i] * (1 - a * 0.9) + orb[i] * a * 0.9)) for i in range(3))
    # cyan accent orb (lower-right, faint)
    d2 = ((x - 190) ** 2 + (y - 200) ** 2) ** 0.5
    if d2 < 70:
        a = (1.0 - d2 / 70) ** 1.8 * 0.55
        acc = (96, 226, 236)
        base = tuple(min(255, int(base[i] * (1 - a) + acc[i] * a)) for i in range(3))
    # glass pill (the "island")
    if in_round_rect(x, y, 62, 108, 194, 150, 21):
        # subtle inner highlight toward the top-left of the pill
        edge = min(x - 62, 194 - x, y - 108, 150 - y)
        hl = min(1.0, max(0.0, edge / 18))
        return (238, 236, 255, int(200 + 55 * hl))
    return base + (255,)


def build_png(size: int, path: Path) -> None:
    global W, H
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # sample the 256 design scaled
            sx, sy = x * W // size, y * H // size
            r, g, b, a = px(sx, sy)
            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    write_png(path, size, size, rows)

def build_ico(path: Path, sizes=(16, 24, 32, 48, 64, 128, 256)) -> None:
    import io
    images = []
    for s in sizes:
        buf = io.BytesIO()
        tmp = path.with_suffix(f".tmp{s}.png")
        build_png(s, tmp)
        buf.write(tmp.read_bytes())
        tmp.unlink()
        images.append((s, buf.getvalue()))
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    body = b""
    entries = b""
    for s, blob in images:
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(blob), offset)
        body += blob
        offset += len(blob)
    path.write_bytes(header + entries + body)

def main() -> None:
    BUILD.mkdir(exist_ok=True)
    build_png(256, BUILD / "icon.png")
    build_png(512, BUILD / "icon@2x.png")
    for s in (16, 24, 32, 48, 64, 128):
        build_png(s, BUILD / f"icon-{s}.png")
    build_ico(BUILD / "icon.ico")
    # tray: 16/32px template-ish
    build_png(32, BUILD / "tray.png")
    print("icons written to", BUILD)

if __name__ == "__main__":
    main()
