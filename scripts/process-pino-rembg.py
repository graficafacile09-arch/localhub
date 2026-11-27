"""
Prepara i 3 asset di Pino (neutro / allegro / triste) su un canvas identico
378x560, con la stessa scala e la stessa linea dei piedi.

Sorgenti (public/):  Pino neutro.png, Pino felice.png, Pino triste.png
Output (public/):    pino-neutro.webp, pino-allegro.webp, pino-triste.webp

Le sorgenti sono temporanee e non restano nel repository: per rigenerare gli
asset vanno ricopiate in public/ con gli stessi nomi.

Le sorgenti arrivano gia' scontornate (canale alpha pulito, sfondo
completamente trasparente, nessun alone bianco) e condividono lo stesso canvas
820x1216 con la stessa inquadratura. Per questo NON si usa rembg: ripassare un
ritaglio gia' pulito su fondo bianco rende semitrasparente la chioma e
l'operazione di unmixing del bianco la annerisce. Qui si conserva l'alpha
originale e si fa solo ridimensionamento + allineamento.

Uso:  python scripts/process-pino-rembg.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# stato -> (sorgente, output)
ASSETS = {
    "neutro": ("Pino neutro.png", "pino-neutro.webp"),
    "allegro": ("Pino felice.png", "pino-allegro.webp"),
    "triste": ("Pino triste.png", "pino-triste.webp"),
}

CANVAS_W, CANVAS_H = 378, 560
# Linea dei piedi comune: la stessa per tutti e 3 gli stati.
BASELINE_Y = CANVAS_H - 6


def subject_bbox(rgba: Image.Image):
    """Bounding box del soggetto (alpha >= 128) come (left, top, right, bottom)."""
    mask = rgba.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    box = mask.getbbox()
    if box is None:
        raise RuntimeError("Sorgente senza soggetto visibile")
    return box


def main() -> None:
    sources = {}
    boxes = {}

    for state, (src_name, _) in ASSETS.items():
        src = PUBLIC / src_name
        img = Image.open(src).convert("RGBA")
        sources[state] = img
        boxes[state] = subject_bbox(img)
        l, t, r, b = boxes[state]
        print(f"[{state}] sorgente {img.size} bbox soggetto {(l, t, r, b)} (h={b - t}px)")

    # Scala unica per tutti e 3 gli stati: limitata dall'altezza utile del canvas
    # e dalla larghezza del soggetto piu' largo. Tutti i soggetti restano quindi
    # nelle stesse proporzioni reciproche delle sorgenti.
    usable_h = BASELINE_Y - 8
    scale_h = usable_h / max(b - t for _, t, _, b in boxes.values())
    max_w = max(r - l for l, _, r, _ in boxes.values())
    scale_w = (CANVAS_W - 6) / max_w
    scale = min(scale_h, scale_w)
    print(f"Scala comune: {scale:.4f} (altezza {scale_h:.4f}, larghezza {scale_w:.4f})")

    for state, (_, out_name) in ASSETS.items():
        img = sources[state]
        l, t, r, b = boxes[state]
        # Ritaglio sul soggetto reale: si scarta il margine trasparente, cosi' il
        # canvas finale e' identico per tutti anche se le sorgenti differiscono
        # di qualche pixel ai bordi.
        crop = img.crop((l, t, r, b))
        new_w = max(1, round((r - l) * scale))
        new_h = max(1, round((b - t) * scale))
        scaled = crop.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Centro orizzontale, piedi sulla linea comune: la base del soggetto
        # (ultima riga non trasparente) cade su BASELINE_Y per tutti e 3.
        x = round((CANVAS_W - new_w) / 2)
        y = max(0, BASELINE_Y - new_h)

        canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
        canvas.alpha_composite(scaled, dest=(max(0, x), y))

        out = PUBLIC / out_name
        # WebP con perdita a qualita' alta: il canvas 378x560 a lossless pesava
        # 220-240 KB, a quality 95 sta sotto i 120 KB senza differenze visibili.
        # alpha_quality 100 preserva il scontorno.
        canvas.save(out, "WEBP", quality=95, alpha_quality=100, method=6)

        arr = np.asarray(canvas).astype(int)
        al = arr[..., 3]
        vis = al >= 128
        scuri = vis & (arr[..., :3].max(axis=2) < 60)
        print(
            f"[{state}] -> {out.name}  {out.stat().st_size / 1024:.1f} KB  "
            f"(x={x}, y={y}, base y={y + new_h}, scala {new_w}/{r - l}={new_w / (r - l):.4f}) "
            f"pixel scuri {100 * scuri.sum() / max(vis.sum(), 1):.1f}%"
        )


if __name__ == "__main__":
    main()
