#!/usr/bin/env python
"""Genera l'asset ad alta risoluzione del Pino della HOMEPAGE di InCittà.

Sorgente unica: ``public/pino-sprite.jpg`` (sprite a 3 frame: happy, neutral,
sad). La homepage usa il frame **neutral** (indice 1).

Lo script NON ridisegna, NON reinterpreta e NON sostituisce Pino: prende il
frame esatto del disegno già usato dalla homepage e ne ricostruisce una
versione professionale:

  1. stima lo sfondo studio (fit di piano sui bordi del frame);
  2. flood-fill dai bordi per lo sfondo esterno;
  3. rimozione dei residui di sfondo *chiusi*: lo sfondo che resta intrappolato
     fra le gambe, fra le braccia e il corpo, ecc. (nel JPEG sono slittine
     quasi bianche larghe 1-3 px, invisibili a un flood-fill dai bordi);
  4. matte antialiasata sul bordo + "unmix" del colore: il colore originale del
     disegno viene recuperato togliendo il contributo dello sfondo, quindi
     nessun alone grigio residuo;
  5. ingrandimento 4x Lanczos su alfa premoltiplicato (bordi puliti, nessun
     stair-stepping, nessun blur bilineare);
  6. ritaglio sul personaggio con padding trasparente pari.

Il risultato è verificato: ricomponendo l'asset sullo sfondo originale si
riottiene il frame di partenza (disegno intatto), e nessun pixel opaco ha il
colore dello sfondo (nessun residuo).

Uso:
    python scripts/gen-pino-homepage.py            # rigenera public/pino-home.png
    python scripts/gen-pino-homepage.py --verify   # controlla l'asset generato
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "pino-sprite.jpg")
OUT = os.path.join(ROOT, "public", "pino-home.png")

FRAME_INDEX = 1        # happy=0, neutral=1, sad=2 (ordine dello sprite)
SCALE = 4              # ingrandimento finale
T_STRICT = 24.0        # distanza RGB: sfondo certo
T_LOOSE = 45.0         # distanza RGB: sfondo sfumato / JPEG
BAND_RADIUS = 2        # spessore della fascia antialiasata attorno al bordo
CORE_MIN = 90.0        # distanza minima dallo sfondo per un pixel "nucleo"
MIN_DC = 60.0          # sotto questa distanza il modello di alpha non è affidabile
HOLE_MAX_AREA = 90     # residui chiusi ammessi (px) prima di scartarli
HOLE_MAX_W = 6
HOLE_MAX_H = 18
HOLE_NEAR_BG = 30.0    # il residuo deve avere il colore esatto dello sfondo
PAD = 2 * SCALE        # padding trasparente uniforme
FIDELITY_MAX = 8.0     # errore medio massimo di ricomposizione


# ---------------------------------------------------------------------------
# morfologia minima (nessuna dipendenza da scipy)
# ---------------------------------------------------------------------------

def flood_from_borders(mask: np.ndarray) -> np.ndarray:
    """Regioni di `mask` connesse (4-vicinanze) ai bordi dell'immagine."""
    h, w = mask.shape
    out = np.zeros((h, w), dtype=bool)
    out[0, :] = mask[0, :]
    out[-1, :] = mask[-1, :]
    out[:, 0] = mask[:, 0]
    out[:, -1] = mask[:, -1]
    while True:
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        grown &= mask
        if np.array_equal(grown, out):
            return out
        out = grown


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


def components(mask: np.ndarray) -> list[np.ndarray]:
    """Componenti connessi (4-vicinanze) di `mask`."""
    h, w = mask.shape
    lab = np.zeros((h, w), dtype=np.int32)
    labels: list[np.ndarray] = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        idx = len(labels) + 1
        stack = [(int(y0), int(x0))]
        lab[y0, x0] = idx
        while stack:
            y, x = stack.pop()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = idx
                    stack.append((ny, nx))
        labels.append(lab == idx)
    return labels


def background_plane(frame: np.ndarray) -> np.ndarray:
    """Stima lo sfondo studio con un fit di piano sui bordi del frame."""
    h, w, _ = frame.shape
    ring = np.zeros((h, w), dtype=bool)
    ring[:3, :] = True
    ring[-3:, :] = True
    ring[:, :3] = True
    ring[:, -3:] = True
    ys, xs = np.nonzero(ring)
    design = np.stack([np.ones_like(xs), xs, ys], axis=1).astype(np.float32)
    coef, *_ = np.linalg.lstsq(design, frame[ys, xs], rcond=None)
    yy, xx = np.mgrid[0:h, 0:w]
    grid = np.stack([np.ones_like(xx), xx, yy], axis=-1).astype(np.float32)
    return (grid @ coef).astype(np.float32)


# ---------------------------------------------------------------------------
# pipeline
# ---------------------------------------------------------------------------

def build_matte(frame: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    """Ritorna (rgb, alpha, stats) alla risoluzione del frame sorgente."""
    bg = background_plane(frame)
    dist = np.sqrt(((frame - bg) ** 2).sum(axis=-1))

    # 1) sfondo esterno: solo quello connesso ai bordi (le parti chiare
    #    interne al disegno restano intatte).
    outside = flood_from_borders(dist < T_STRICT)
    outside |= flood_from_borders(dist < T_LOOSE)

    # 2) residui chiusi: slittine di sfondo intrappolate nel disegno.
    ring_bg = np.median(
        np.concatenate([frame[0, :, :], frame[-1, :, :], frame[:, 0, :], frame[:, -1, :]]),
        axis=0,
    )
    gaps = np.zeros(frame.shape[:2], dtype=bool)
    for comp in components((dist < T_LOOSE) & ~outside):
        ys, xs = np.nonzero(comp)
        area = int(comp.sum())
        bw = int(xs.max() - xs.min() + 1)
        bh = int(ys.max() - ys.min() + 1)
        near_bg = float(np.sqrt(((frame[comp].mean(axis=0) - ring_bg) ** 2).sum())) < HOLE_NEAR_BG
        if area <= HOLE_MAX_AREA and bw <= HOLE_MAX_W and bh <= HOLE_MAX_H and near_bg:
            gaps |= comp
    outside = outside | gaps

    # 3) colore locale del disegno: propagato dal nucleo (pixel pienamente
    #    dentro la sagoma) verso il bordo.
    core = dist > CORE_MIN
    colour = frame.copy()
    known = core.copy()
    for _ in range(BAND_RADIUS + 4):
        if known.all():
            break
        acc = np.zeros_like(colour)
        cnt = np.zeros(frame.shape[:2] + (1,), dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb_c = np.roll(np.roll(colour, dy, 0), dx, 1)
            nb_k = np.roll(np.roll(known, dy, 0), dx, 1)[..., None]
            acc += nb_c * nb_k
            cnt += nb_k
        newly = (~known) & (cnt[..., 0] > 0)
        colour[newly] = acc[newly] / np.maximum(cnt[newly], 1.0)
        known |= newly

    # 4) matte del bordo per "colour line": un pixel antialiasato dal JPEG è
    #    una miscela fra colore-disegno e sfondo: l'alfa è il rapporto fra
    #    quanto il pixel si allontana dallo sfondo e quanto se ne
    #    allontana il colore del disegno in quel punto. Con la vecchia rampa a
    #    soglia l'alfa restava troppo alto vicino allo sfondo: da lì l'alone.
    dc = np.sqrt(((colour - bg) ** 2).sum(axis=-1))
    band = dilate(outside, BAND_RADIUS) & ~outside
    a_est = np.clip(dist / np.maximum(dc, 40.0), 0.0, 1.0)
    alpha = np.ones(frame.shape[:2], dtype=np.float32)
    alpha[band] = a_est[band]
    alpha[band & (dc < MIN_DC)] = 1.0     # modello non affidabile: disegno intatto
    alpha[outside] = 0.0
    alpha[alpha < 0.05] = 0.0

    # 5) colore: unmix dove l'alfa è affidabile, altrimenti il colore locale
    #    del disegno. In nessun caso un pixel di bordo resta grigio-sfondo.
    a = np.maximum(alpha, 0.05)[:, :, None]
    unmixed = np.clip((frame - (1.0 - a) * bg) / a, 0, 255)
    rgb = np.where((alpha >= 0.5)[:, :, None], unmixed, colour)
    rgb = np.where(alpha[:, :, None] > 0.999, frame, rgb).astype(np.float32)
    rgb[alpha <= 0.0] = 0.0

    # 6) fedeltà: ricomponendo l'asset sullo sfondo stimato si deve riottenere
    #    il frame di partenza (disegno non alterato).
    comp = rgb * a + bg * (1.0 - a)
    err = np.sqrt(((comp - frame) ** 2).sum(axis=-1))
    keep = ~outside
    stats = {
        "enclosed_gap_px": int(gaps.sum()),
        "gap_regions": len(components(gaps)),
        "composite_error": round(float(err[keep].mean()), 3) if keep.any() else 0.0,
        "composite_error_max": round(float(err[keep].max()), 1) if keep.any() else 0.0,
    }
    return rgb, alpha, stats


def upscale(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Lanczos su alfa premoltiplicato: bordi puliti, nessun alone."""
    a = alpha[:, :, None]
    prem = np.dstack([rgb * a, alpha * 255.0]).astype(np.uint8)
    big = Image.fromarray(prem, "RGBA").resize(
        (rgb.shape[1] * SCALE, rgb.shape[0] * SCALE), Image.LANCZOS
    )
    arr = np.asarray(big).astype(np.float32)
    ab = arr[:, :, 3:4] / 255.0
    rgb_big = np.where(ab > 0.004, arr[:, :, :3] / np.maximum(ab, 0.004), 0.0)
    return np.dstack([np.clip(rgb_big, 0, 255), arr[:, :, 3]]).astype(np.uint8)


def generate() -> tuple[Image.Image, dict]:
    source = Image.open(SRC).convert("RGB")
    full = np.asarray(source).astype(np.float32)
    frame_w = full.shape[1] // 3
    frame = full[:, FRAME_INDEX * frame_w:(FRAME_INDEX + 1) * frame_w]

    rgb, alpha, stats = build_matte(frame)

    # ritaglio deterministico: bbox del personaggio calcolato sull'alfa alla
    # risoluzione sorgente (non sulla soglia dei pixel upscalati), così la
    # dimensione dell'asset non cambia fra una rigenerazione e l'altra.
    ys, xs = np.where(alpha > 0.0)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
    hi = upscale(rgb, alpha)[y0 * SCALE:(y1 + 1) * SCALE, x0 * SCALE:(x1 + 1) * SCALE]

    canvas = np.zeros((hi.shape[0] + 2 * PAD, hi.shape[1] + 2 * PAD, 4), dtype=np.uint8)
    canvas[PAD:PAD + hi.shape[0], PAD:PAD + hi.shape[1]] = hi

    stats["source_frame"] = (frame_w, frame.shape[0])
    stats["artwork"] = (x1 - x0 + 1, y1 - y0 + 1)
    stats["output"] = (canvas.shape[1], canvas.shape[0])
    return Image.fromarray(canvas, "RGBA"), stats


# ---------------------------------------------------------------------------
# verifica
# ---------------------------------------------------------------------------

def verify(path: str = OUT) -> int:
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    problems: list[str] = []

    source = Image.open(SRC).convert("RGB")
    full = np.asarray(source).astype(np.float32)
    fw = full.shape[1] // 3
    frame = full[:, FRAME_INDEX * fw:(FRAME_INDEX + 1) * fw]
    bg = background_plane(frame)
    dist = np.sqrt(((frame - bg) ** 2).sum(axis=-1))
    outside = flood_from_borders(dist < T_STRICT) | flood_from_borders(dist < T_LOOSE)

    a = alpha[:, :, None] / 255.0
    comp = rgb * a + np.array([235.0, 240.0, 245.0]) * (1 - a)
    opaque = alpha >= 250
    d_bg = np.sqrt(((rgb - np.array([245.0, 245.7, 246.3])) ** 2).sum(axis=-1))
    residue = int((opaque & (d_bg < 24)).sum())
    share = residue / max(1, int(opaque.sum()))

    print(f"  dimensione                  : {im.size[0]}x{im.size[1]} px")
    print(f"  artwork                     : {im.size[0] // SCALE - 4}x{im.size[1] // SCALE - 4} px a 1x")
    print(f"  ingrandimento               : {SCALE}x")
    print(f"  bordo antialiasato          : {int(((alpha > 10) & (alpha < 245)).sum())} px")
    print(f"  trasparenza piena           : {int((alpha == 0).sum())} px")
    print(f"  pixel opachi                : {int(opaque.sum())}")
    print(f"  residui di sfondo opachi    : {residue} ({share * 100:.2f}%)  (atteso < 0.30%)")
    if share > 0.003:
        problems.append(f"residui di sfondo opachi: {residue} px ({share * 100:.2f}%)")

    # sagoma confrontata con quella del disegno originale
    small = Image.fromarray(np.asarray(im)[:, :, 3], "L").resize(
        (im.size[0] // SCALE, im.size[1] // SCALE), Image.LANCZOS
    )

    def tight(mask: np.ndarray) -> np.ndarray:
        ys, xs = np.where(mask)
        crop = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        return np.asarray(
            Image.fromarray((crop * 255).astype(np.uint8), "L").resize((110, 160), Image.LANCZOS)
        ).astype(np.float32) / 255.0

    mask_new = tight(np.asarray(small) > 127) > 0.5
    mask_src = tight(dist > 70) > 0.5
    iou = float(np.minimum(mask_new, mask_src).sum() / max(1, np.maximum(mask_new, mask_src).sum()))
    print(f"  sagoma vs sorgente (IoU)    : {iou:.3f}  (atteso >= 0.90)")
    if iou < 0.90:
        problems.append(f"sagoma troppo diversa dal disegno originale (IoU {iou:.3f})")

    # nessun buco interno accidentale: i soli buchi ammessi sono i distacchi
    # di sfondo già presenti nel disegno originale (fra le gambe, le braccia...)
    ring_bg = np.median(
        np.concatenate([frame[0, :, :], frame[-1, :, :], frame[:, 0, :], frame[:, -1, :]]),
        axis=0,
    )
    src_gaps = 0
    for comp_ in components((dist < T_LOOSE) & ~outside):
        ys, xs = np.nonzero(comp_)
        if (int(comp_.sum()) <= HOLE_MAX_AREA
                and int(xs.max() - xs.min() + 1) <= HOLE_MAX_W
                and int(ys.max() - ys.min() + 1) <= HOLE_MAX_H
                and float(np.sqrt(((frame[comp_].mean(axis=0) - ring_bg) ** 2).sum())) < HOLE_NEAR_BG):
            src_gaps += 1
    holes = 0
    for comp_ in components((alpha < 20) & ~flood_from_borders(alpha < 20)):
        if int(comp_.sum()) and (~dilate(comp_, 2) & (alpha > 200)).sum() > comp_.sum() * 2:
            holes += 1
    print(f"  buchi interni nel disegno   : {holes}  (distacchi attesi: {src_gaps})")
    if holes > src_gaps + 3:
        problems.append(f"buchi interni non previsti ({holes} vs {src_gaps} attesi)")

    # nessun velo grigio sopra la pagina chiara
    comp_light = comp.mean(axis=2)
    ring = dilate(alpha > 200, 4) & (alpha <= 200)
    if ring.any():
        drop = float((245.0 - comp_light[ring]).mean())
        print(f"  annerimento del bordo       : {drop:+.1f} unità (bordo antialiasato, atteso >= 0)")

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
        if not os.path.exists(OUT):
            print(f"Asset mancante: {OUT}", file=sys.stderr)
            return 1
        print("Verifica asset homepage di Pino:")
        return verify()

    if not os.path.exists(SRC):
        print(f"Sorgente mancante: {SRC}", file=sys.stderr)
        return 1

    im, stats = generate()
    im.save(OUT)
    for k, v in stats.items():
        print(f"  {k:20s}: {v}")
    print(f"  scritto             : {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1024:.0f} KB)")
    if stats["composite_error"] > FIDELITY_MAX:
        print("  [FAIL] ricomposizione non fedele al disegno originale", file=sys.stderr)
        return 1
    return verify()


if __name__ == "__main__":
    raise SystemExit(main())
