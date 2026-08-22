"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Loader2,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
} from "lucide-react";

/** Rettangolo di ritaglio NORMALIZZATO (0..1) sull'immagine trasformata (rotata/riflessa). */
type CropRect = { x: number; y: number; w: number; h: number };

type MerchantImageEditorDialogProps = {
  /** Immagine corrente dell'annuncio (data URL o URL pubblico). */
  imageUrl: string;
  onClose: () => void;
  /**
   * Persiste la nuova immagine (JPEG data URL). Se lancia un errore la modal
   * resta aperta e mostra il messaggio.
   */
  onSave: (dataUrl: string) => Promise<void>;
};

const CROP_MIN = 0.08; // dimensione minima del ritaglio (normalizzata)
const MAX_EXPORT = 1200; // lato massimo dell'immagine esportata (evita output enormi)
const PREVIEW_MAX_W = 560; // anteprima editor
const PREVIEW_MAX_H = 420;
const QUALITY = 0.85; // stessa qualità dell'acquisizione fotocamera (captureFrame)

function fit(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Disegna l'immagine trasformata (rotazione + riflessione) centrata nel canvas,
 * scalata di `scale` (1 = dimensione naturale). Il canvas deve avere già le
 * dimensioni dell'immagine trasformata × scale, così l'immagine lo riempie
 * esattamente senza essere ritagliata.
 */
function drawTransformed(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rot: number,
  fx: boolean,
  fy: boolean,
  scale = 1
) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.save();
  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.scale(scale * (fx ? -1 : 1), scale * (fy ? -1 : 1));
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

type DragMode = "move" | "nw" | "ne" | "sw" | "se";

export default function MerchantImageEditorDialog({
  imageUrl,
  onClose,
  onSave,
}: MerchantImageEditorDialogProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rot, setRot] = useState(0); // 0 | 1 | 2 | 3 → 0°, 90°, 180°, 270°
  const [fx, setFx] = useState(false); // riflessione orizzontale
  const [fy, setFy] = useState(false); // riflessione verticale
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [cropMode, setCropMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCrop: CropRect;
    rect: DOMRect;
  } | null>(null);

  // ── Caricamento dell'immagine iniziale ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const el = new Image();
    // URL remoti (storage): crossOrigin per non "inquinare" il canvas.
    if (/^https?:/i.test(imageUrl)) el.crossOrigin = "anonymous";
    el.onload = () => {
      if (cancelled) return;
      setImg(el);
      setLoading(false);
    };
    el.onerror = () => {
      if (cancelled) return;
      setLoading(false);
      setLoadError("Impossibile caricare l'immagine da modificare.");
    };
    el.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // ── ESC = Annulla ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || saving) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // ── Nasconde la bottom nav mobile (stesso pattern delle altre modal) ─────
  useEffect(() => {
    document.body.classList.add("correggi-ai-aperto");
    return () => document.body.classList.remove("correggi-ai-aperto");
  }, []);

  const W = img?.naturalWidth ?? 1;
  const H = img?.naturalHeight ?? 1;
  const swap = rot % 2 === 1;
  const tw = swap ? H : W;
  const th = swap ? W : H;
  const preview = fit(tw, th, PREVIEW_MAX_W, PREVIEW_MAX_H);

  // ── Anteprima grande (immagine trasformata) ──────────────────────────────
  useEffect(() => {
    if (!img || !previewRef.current) return;
    const canvas = previewRef.current;
    canvas.width = preview.w;
    canvas.height = preview.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    // Scala l'immagine per riempire il canvas: senza questo fattore l'immagine
    // (dimensione naturale) trabocca dal canvas e l'anteprima mostrerebbe solo
    // il centro, disallineando la selezione visiva dall'area esportata.
    drawTransformed(ctx, img, rot, fx, fy, preview.w / tw);
  }, [img, rot, fx, fy, preview.w, preview.h, tw]);

  // ── Anteprima del RISULTATO (ritaglio corrente) ──────────────────────────
  useEffect(() => {
    if (!img || !resultRef.current) return;
    const canvas = resultRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = Math.min(1, MAX_EXPORT / Math.max(tw, th));
    const tw2 = Math.round(tw * scale);
    const th2 = Math.round(th * scale);

    const full = document.createElement("canvas");
    full.width = tw2;
    full.height = th2;
    const fctx = full.getContext("2d");
    if (!fctx) return;
    fctx.imageSmoothingQuality = "high";
    drawTransformed(fctx, img, rot, fx, fy, scale);

    const cw = Math.max(1, Math.round(crop.w * tw2));
    const ch = Math.max(1, Math.round(crop.h * th2));
    const cx = Math.min(tw2 - cw, Math.round(crop.x * tw2));
    const cy = Math.min(th2 - ch, Math.round(crop.y * th2));

    const rs = Math.min(96 / cw, 96 / ch, 1);
    const rw = Math.max(1, Math.round(cw * rs));
    const rh = Math.max(1, Math.round(ch * rs));
    canvas.width = rw;
    canvas.height = rh;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(full, cx, cy, cw, ch, 0, 0, rw, rh);
  }, [img, rot, fx, fy, crop, tw, th, W, H]);

  function resetCrop() {
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
  }

  function ruotaSinistra() {
    setRot((r) => (r + 3) % 4);
    resetCrop();
  }

  function ruotaDestra() {
    setRot((r) => (r + 1) % 4);
    resetCrop();
  }

  function riflettiOrizzontale() {
    setFx((v) => !v);
    resetCrop();
  }

  function riflettiVerticale() {
    setFy((v) => !v);
    resetCrop();
  }

  function handleReplace(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const el = new Image();
      el.onload = () => {
        setImg(el);
        setRot(0);
        setFx(false);
        setFy(false);
        resetCrop();
        setCropMode(false);
        setLoadError(null);
      };
      el.onerror = () => setLoadError("Immagine non valida.");
      el.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  // ── Drag del ritaglio (pointer events, coordinate normalizzate) ──────────
  function startDrag(e: React.PointerEvent, mode: DragMode) {
    if (!cropMode || !img) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const container = target.closest("[data-editor-preview]") as HTMLElement | null;
    if (!container) return;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      rect: container.getBoundingClientRect(),
    };
  }

  function onDragMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.rect.width;
    const dy = (e.clientY - drag.startY) / drag.rect.height;
    const s = drag.startCrop;

    if (drag.mode === "move") {
      setCrop({
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      });
      return;
    }

    let { x, y, w, h } = s;
    if (drag.mode.includes("e")) w = clamp(s.w + dx, CROP_MIN, 1 - s.x);
    if (drag.mode.includes("s")) h = clamp(s.h + dy, CROP_MIN, 1 - s.y);
    if (drag.mode.includes("w")) {
      const nx = clamp(s.x + dx, 0, s.x + s.w - CROP_MIN);
      w = s.w + (s.x - nx);
      x = nx;
    }
    if (drag.mode.includes("n")) {
      const ny = clamp(s.y + dy, 0, s.y + s.h - CROP_MIN);
      h = s.h + (s.y - ny);
      y = ny;
    }
    setCrop({ x, y, w, h });
  }

  function endDrag(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  /** Esporta il risultato: immagine trasformata + ritaglio, JPEG 0.85. */
  function exportDataUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!img) {
        reject(new Error("Immagine non disponibile."));
        return;
      }
      const scale = Math.min(1, MAX_EXPORT / Math.max(tw, th));
      const tw2 = Math.round(tw * scale);
      const th2 = Math.round(th * scale);

      const full = document.createElement("canvas");
      full.width = tw2;
      full.height = th2;
      const fctx = full.getContext("2d");
      if (!fctx) {
        reject(new Error("Canvas non supportato in questo browser."));
        return;
      }
      fctx.imageSmoothingQuality = "high";
      drawTransformed(fctx, img, rot, fx, fy, scale);

      const cw = Math.max(1, Math.round(crop.w * tw2));
      const ch = Math.max(1, Math.round(crop.h * th2));
      const cx = Math.min(tw2 - cw, Math.round(crop.x * tw2));
      const cy = Math.min(th2 - ch, Math.round(crop.y * th2));

      const out = document.createElement("canvas");
      out.width = cw;
      out.height = ch;
      const octx = out.getContext("2d");
      if (!octx) {
        reject(new Error("Canvas non supportato in questo browser."));
        return;
      }
      octx.imageSmoothingQuality = "high";
      octx.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch);

      out.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Impossibile esportare l'immagine."));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Impossibile esportare l'immagine."));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        QUALITY
      );
    });
  }

  async function handleSave() {
    if (!img || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const dataUrl = await exportDataUrl();
      await onSave(dataUrl);
      onClose();
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "Errore durante il salvataggio."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Modifica immagine"
    >
      {/* Backdrop: chiude senza salvare (come Annulla) */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div className="relative flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 bg-gradient-to-b from-blue-600 to-blue-700 px-5 py-4 text-white">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Crop className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200">
              Immagine annuncio
            </p>
            <p className="text-sm font-black tracking-tight">Modifica immagine</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Annulla e chiudi"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo scrollabile */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loadError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              {loadError}
            </div>
          )}

          {loading && (
            <div className="flex min-h-[220px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}

          {img && !loading && (
            <div className="space-y-4">
              {/* Anteprima grande + overlay ritaglio */}
              <div
                data-editor-preview
                className="relative mx-auto"
                onPointerMove={cropMode ? onDragMove : undefined}
                onPointerUp={cropMode ? endDrag : undefined}
                onPointerCancel={cropMode ? endDrag : undefined}
              >
                <div
                  className="relative overflow-hidden rounded-2xl bg-slate-100"
                  style={{
                    width: `${preview.w}px`,
                    maxWidth: "100%",
                    aspectRatio: `${tw} / ${th}`,
                  }}
                >
                  <canvas ref={previewRef} className="block h-full w-full" />
                  {cropMode && (
                    <div className="absolute inset-0 cursor-crosshair touch-none select-none">
                      {/* Box di selezione: bordi + oscuramento (clippato dal container) */}
                      <div
                        className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                        style={{
                          left: `${crop.x * 100}%`,
                          top: `${crop.y * 100}%`,
                          width: `${crop.w * 100}%`,
                          height: `${crop.h * 100}%`,
                        }}
                        data-test-crop={`${crop.x},${crop.y},${crop.w},${crop.h}`}
                        onPointerDown={(e) => startDrag(e, "move")}
                      />
                    </div>
                  )}
                </div>

                {cropMode && (
                  /* Maniglie su layer NON clippato: sempre visibili e afferrabili,
                     anche a selezione piena (il container ha overflow-hidden + angoli
                     arrotondati che taglierebbero le maniglie sugli angoli). */
                  <div className="pointer-events-none absolute inset-0 touch-none select-none">
                    <span
                      className="pointer-events-auto absolute h-4 w-4 cursor-nwse-resize rounded-sm border border-slate-400 bg-white shadow-sm"
                      style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, transform: "translate(-50%, -50%)" }}
                      onPointerDown={(e) => startDrag(e, "nw")}
                    />
                    <span
                      className="pointer-events-auto absolute h-4 w-4 cursor-nesw-resize rounded-sm border border-slate-400 bg-white shadow-sm"
                      style={{ left: `${(crop.x + crop.w) * 100}%`, top: `${crop.y * 100}%`, transform: "translate(-50%, -50%)" }}
                      onPointerDown={(e) => startDrag(e, "ne")}
                    />
                    <span
                      className="pointer-events-auto absolute h-4 w-4 cursor-nesw-resize rounded-sm border border-slate-400 bg-white shadow-sm"
                      style={{ left: `${crop.x * 100}%`, top: `${(crop.y + crop.h) * 100}%`, transform: "translate(-50%, -50%)" }}
                      onPointerDown={(e) => startDrag(e, "sw")}
                    />
                    <span
                      className="pointer-events-auto absolute h-4 w-4 cursor-nwse-resize rounded-sm border border-slate-400 bg-white shadow-sm"
                      style={{ left: `${(crop.x + crop.w) * 100}%`, top: `${(crop.y + crop.h) * 100}%`, transform: "translate(-50%, -50%)" }}
                      onPointerDown={(e) => startDrag(e, "se")}
                    />
                  </div>
                )}
              </div>
              {cropMode && (
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  Trascina per spostare il ritaglio, usa gli angoli per ridimensionarlo.
                </p>
              )}

              {/* Anteprima del risultato */}
              <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Risultato
                </span>
                <canvas
                  ref={resultRef}
                  className="rounded-lg border border-slate-200 bg-white shadow-sm"
                  style={{ maxWidth: 96, maxHeight: 96 }}
                />
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCropMode((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    cropMode
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
                  }`}
                >
                  <Crop className="h-3.5 w-3.5" />
                  Ritaglia
                </button>
                <button
                  type="button"
                  onClick={resetCrop}
                  disabled={crop.w >= 0.999 && crop.h >= 0.999}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Ripristina
                </button>
                <button
                  type="button"
                  onClick={ruotaSinistra}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Ruota sx
                </button>
                <button
                  type="button"
                  onClick={ruotaDestra}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Ruota dx
                </button>
                <button
                  type="button"
                  onClick={riflettiOrizzontale}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <FlipHorizontal2 className="h-3.5 w-3.5" />
                  Rifletti ↔
                </button>
                <button
                  type="button"
                  onClick={riflettiVerticale}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <FlipVertical2 className="h-3.5 w-3.5" />
                  Rifletti ↕
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Sostituisci
                </button>
              </div>

              {/* Input nascosto per sostituire l'immagine */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleReplace(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
                aria-label="Sostituisci immagine"
              />
            </div>
          )}

          {saveError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !img || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow shadow-blue-500/20 transition hover:shadow-md hover:shadow-blue-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}
