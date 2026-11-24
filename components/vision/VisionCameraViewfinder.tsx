"use client";

import type { RefObject } from "react";
import { ImageIcon } from "lucide-react";

/**
 * Viewfinder condiviso (mirino + area di ritaglio + accesso galleria).
 *
 * Copia presentazionale del blocco presente in
 * components/merchant/ai/MerchantProductAiUploader.tsx. Non è collegato al
 * percorso venditori: nessun import è stato aggiunto dal uploader.
 * Parità dei marcatori JSX verificata da tests/vision-core-parity.spec.mjs.
 */
type VisionCameraViewfinderProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  visible: boolean;
  uploadInputId: string;
  onUploadClick?: () => void;
  hint?: string;
  uploadLabel?: string;
};

export default function VisionCameraViewfinder({
  videoRef,
  visible,
  uploadInputId,
  onUploadClick,
  hint = "Inquadra il prodotto...",
  uploadLabel = "Carica immagine",
}: VisionCameraViewfinderProps) {
  return (
    <div className={`relative bg-black rounded-2xl overflow-hidden pointer-events-none select-none touch-none ${visible ? "" : "hidden"}`}>
      <video
        ref={videoRef}
        className="w-full aspect-square object-cover pointer-events-none"
        playsInline
        muted
        disablePictureInPicture
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="aspect-square w-4/5 rounded-xl" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="aspect-square w-4/5 rounded-xl border-2 border-white/70" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="aspect-square w-4/5">
          <div className="absolute top-0 left-0 h-8 w-8 rounded-tl-xl border-t-4 border-l-4 border-white" />
          <div className="absolute top-0 right-0 h-8 w-8 rounded-tr-xl border-t-4 border-r-4 border-white" />
          <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-4 border-l-4 border-white" />
          <div className="absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-4 border-r-4 border-white" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 pb-3 pt-8 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-xs text-white/70">{hint}</span>
        <label
          htmlFor={uploadInputId}
          onClick={onUploadClick}
          className="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/30 active:scale-[0.97]"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          {uploadLabel}
        </label>
      </div>
    </div>
  );
}
