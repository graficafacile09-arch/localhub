#!/usr/bin/env python
"""Genera gli asset di Pino (neutro / allegro / triste) per InCittà.

Sorgenti: i tre TIFF RGBA forniti dal cliente, conservati in
``scripts/__pino-src/`` (pino-neutro.tif, pino-allegro.tif, pino-triste.tif).

I TIFF hanno già il canale alpha, ma il colore dei pixel di bordo è ancora
**mescolato col bianco** dello sfondo originale (un pixel con alpha 84 ha
RGB 194 dove il personaggio è ~90): è quello che sul sito diventa un alone
chiaro attorno ai capelli. Lo script:

  1. azzera il rumore di alpha (valori <= 8) e le particelle isolate lontane
     dal personaggio;
  2. fa l'*unmix* del matte bianco:  C = (P - (1-a) * 255) / a,  così ogni
     pixel di bordo riprende il colore reale del disegno (nessun alone, su
     qualunque fondo);
  3. ritaglia sul contenuto;
  4. inquadra i tre stati sullo stesso canvas (stessa larghezza, cima della
     chioma allineata, personaggio centrato): cambiando stato Pino non si
     sposta e non cambia dimensione.

Uso:
    python scripts/gen-pino-assets.py            # rigenera i tre PNG
    python scripts/gen-pino-assets.py --verify   # controlla gli asset prodotti
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "scripts", "__pino-src")
OUT_DIR = os.path.join(ROOT, "public")

MOODS = {
    "neutro": "pino-neutro.tif",
    "allegro": "pino-allegro.tif",
    "triste": "pino-triste.tif",
}

MATTE = 255.0      # sfondo originale dei TIFF: bianco puro
ALPHA_NOISE = 8    # sotto questa soglia l'alpha è rumore
SPECK_RADIUS = 6   # raggio entro cui una particella è considerata attaccata
PAD = 8            # margine trasparente attorno al contenuto
OUT_SIZE = (378, 560)  # canvas comune: (larghezza, altezza)
EXT = "webp"       # WebP senza perdita: identico al pixel, ~40% più leggero del PNG


# ---------------------------------------------------------------------------
# morfologia minima
# ---------------------------------------------------------------------------

def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(r):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


# ---------------------------------------------------------------------------
# pipeline
# ---------------------------------------------------------------------------

def load_source(path: str) -> np.ndarray:
    im = Image.open(path)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    return np.asarray(im).astype(np.float32)


def clean_alpha(alpha: np.ndarray) -> np.ndarray:
    """Toglie il rumore di alpha e le particelle isolate di sfondo."""
    alpha = alpha.copy()
    alpha[alpha <= ALPHA_NOISE] = 0.0
    core = alpha >= 64
    keep = dilate(core, SPECK_RADIUS)
    alpha[~keep] = 0.0
    return alpha


def unmix_white(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Recupera il colore del disegno togliendo il matte bianco."""
    a = alpha[:, :, None] / 255.0
    safe = np.maximum(a, 0.02)
    out = (rgb - (1.0 - a) * MATTE) / safe
    out = np.clip(out, 0, 255)
    # i pixel trasparenti non portano colore
    out[alpha <= 0.0] = 0.0
    return out


def frame_on_canvas(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Ritaglia sul contenuto e centra sul canvas comune (chioma in alto)."""
    ys, xs = np.where(alpha > 0.0)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    canvas = np.zeros((OUT_SIZE[1], OUT_SIZE[0], 4), dtype=np.uint8)
    px = (OUT_SIZE[0] - cw) // 2
    py = min(PAD, OUT_SIZE[1] - ch)
    canvas[py:py + ch, px:px + cw, :3] = rgb[y0:y1 + 1, x0:x1 + 1].astype(np.uint8)
    canvas[py:py + ch, px:px + cw, 3] = alpha[y0:y1 + 1, x0:x1 + 1].astype(np.uint8)
    return canvas


def generate_one(name: str, path: str) -> tuple[np.ndarray, dict]:
    src = load_source(path)
    alpha = clean_alpha(src[:, :, 3])
    rgb = unmix_white(src[:, :, :3], alpha)

    # fedeltà: ricomponendo il colore unmixed sul bianco si deve riottenere
    # esattamente il pixel originale.
    a = alpha[:, :, None] / 255.0
    recomp = rgb * a + (1.0 - a) * MATTE
    sel = alpha > 0
    err = np.sqrt(((recomp - src[:, :, :3]) ** 2).sum(axis=-1))[sel]

    # colore di bordo: prima e dopo l'unmix (l'alone chiaro deve sparire)
    soft = (alpha > 90) & (alpha < 245)
    lum_before = src[:, :, :3].mean(axis=2)[soft]
    lum_after = rgb.mean(axis=2)[soft]
    op = alpha >= 250
    lum_int = rgb.mean(axis=2)[op]

    stats = {
        "sorgente": (src.shape[1], src.shape[0]),
        "alpha0": int((alpha == 0).sum()),
        "bordo": int(soft.sum()),
        "lum_interno": round(float(np.median(lum_int)), 1) if op.any() else 0.0,
        "lum_bordo_prima": round(float(np.median(lum_before)), 1) if soft.any() else 0.0,
        "lum_bordo_dopo": round(float(np.median(lum_after)), 1) if soft.any() else 0.0,
        "errore_ricomposizione": round(float(err.mean()), 3) if sel.any() else 0.0,
    }
    return frame_on_canvas(rgb, alpha), stats


def generate() -> dict:
    out = {}
    for name, fname in MOODS.items():
        canvas, stats = generate_one(name, os.path.join(SRC_DIR, fname))
        dest = os.path.join(OUT_DIR, f"pino-{name}.{EXT}")
        Image.fromarray(canvas, "RGBA").save(
            dest, format="WEBP", lossless=True, quality=100, method=6, exact=True
        )
        height, width = canvas.shape[0], canvas.shape[1]
        stats["asset"] = (width, height)
        stats["kb"] = round(os.path.getsize(dest) / 1024)
        out[name] = stats
        print(f"  pino-{name}.{EXT}  {width}x{height}  {stats['kb']} KB")
        print(f"     sorgente {stats['sorgente'][0]}x{stats['sorgente'][1]}"
              f" | bordo {stats['bordo']} px"
              f" | luminanza bordo {stats['lum_bordo_prima']} -> {stats['lum_bordo_dopo']}"
              f" (interno {stats['lum_interno']})")
        print(f"     errore di ricomposizione {stats['errore_ricomposizione']}")
    return out


# ---------------------------------------------------------------------------
# verifica
# ---------------------------------------------------------------------------

def verify() -> int:
    problems: list[str] = []
    for name in MOODS:
        path = os.path.join(OUT_DIR, f"pino-{name}.{EXT}")
        if not os.path.exists(path):
            print(f"  {name}: asset mancante")
            problems.append(f"{name}: asset mancante")
            continue
        arr = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
        alpha, rgb = arr[:, :, 3], arr[:, :, :3]
        soft = (alpha > 90) & (alpha < 245)
        op = alpha >= 250
        lum_soft = float(np.median(rgb.mean(axis=2)[soft])) if soft.any() else 0.0
        lum_int = float(np.median(rgb.mean(axis=2)[op])) if op.any() else 0.0

        # residuo del matte bianco: pixel visibili che sono ancora quasi bianchi.
        # Il disegno di Pino non ha bianchi puri sul contorno, quindi restare
        # sotto la soglia dimostra che l'unmix ha tolto lo sfondo.
        d_white = np.sqrt(((rgb - MATTE) ** 2).sum(axis=-1))
        vis = alpha >= 128
        bianchi = int((vis & (d_white < 40)).sum())
        quota = bianchi / max(1, int(vis.sum()))

        delta = abs(lum_soft - lum_int)
        print(f"  {name}: {arr.shape[1]}x{arr.shape[0]}"
              f" | bordo {int(soft.sum())} px"
              f" | lum bordo {lum_soft:.0f} vs interno {lum_int:.0f} (delta {delta:.0f})"
              f" | pixel visibili quasi bianchi {quota * 100:.2f}%")
        if delta > 20:
            problems.append(f"{name}: bordo con luminanza fuori posto (delta {delta:.0f})")
        if quota > 0.015:
            problems.append(f"{name}: residuo di matte bianco ({bianchi} px visibili)")
        if int((alpha == 0).sum()) == 0:
            problems.append(f"{name}: nessuna trasparenza")

    if problems:
        print("  [FAIL]")
        for p in problems:
            print(f"      - {p}")
        return 1
    print("  [OK]")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    if args.verify:
        print("Verifica asset di Pino:")
        return verify()

    missing = [m for m in MOODS.values() if not os.path.exists(os.path.join(SRC_DIR, m))]
    if missing:
        print(f"Sorgenti mancanti in {os.path.relpath(SRC_DIR, ROOT)}: {', '.join(missing)}",
              file=sys.stderr)
        return 1

    print(f"Generazione asset di Pino ({EXT} senza perdita):")
    generate()
    return verify()


if __name__ == "__main__":
    raise SystemExit(main())
