"use client";

import { useEffect, useMemo, useState } from "react";
import MerchantImageEditorDialog from "@/components/merchant/ai/MerchantImageEditorDialog";

/**
 * PAGINA TEMPORANEA DI TEST — da eliminare dopo la verifica.
 * Genera un'immagine i cui pixel codificano le coordinate sorgente
 * (R = x & 0xff, G = y & 0xff) così il crop esportato è verificabile
 * campionando i pixel. Espone il data URL salvato in window.__saved.
 */
function makeImage(w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      id.data[i] = (x >> 2) & 0xff; // R = x/4: gradiente lento, niente wrap sotto 1024px
      id.data[i + 1] = (y >> 2) & 0xff; // G = y/4
      id.data[i + 2] = ((x + y) >> 3) & 0xff;
      id.data[i + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL("image/png");
}

export default function TestEditorPage() {
  const [params, setParams] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({
      w: Number(q.get("w") ?? 800),
      h: Number(q.get("h") ?? 600),
    });
  }, []);

  const imageUrl = useMemo(
    () => (params ? makeImage(params.w, params.h) : ""),
    [params]
  );

  if (!params) return <p>loading</p>;

  return (
    <div style={{ padding: 20 }}>
      <p id="test-info">
        Test editor: {params.w}x{params.h}
      </p>
      <MerchantImageEditorDialog
        key={params.w + "-" + params.h}
        imageUrl={imageUrl}
        onClose={() => {
          (window as unknown as Record<string, unknown>).__closed = true;
        }}
        onSave={async (dataUrl) => {
          (window as unknown as Record<string, unknown>).__saved = dataUrl;
        }}
      />
    </div>
  );
}
