"use client";

import { Camera, ImageIcon } from "lucide-react";

/**
 * Azioni iniziali condivise (scatta foto / carica immagine).
 *
 * Copia presentazionale del blocco presente in
 * components/merchant/ai/MerchantProductAiUploader.tsx, non collegata.
 */
type VisionCaptureActionsProps = {
  uploadInputId: string;
  onCameraClick: () => void;
};

export default function VisionCaptureActions({
  uploadInputId,
  onCameraClick,
}: VisionCaptureActionsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <button
        type="button"
        onClick={onCameraClick}
        className="group relative w-full overflow-hidden rounded-[2rem] border-2 border-dashed border-blue-300 bg-gradient-to-b from-blue-50 to-blue-50/60 px-4 py-8 text-center transition-all hover:border-blue-400 hover:shadow-lg hover:shadow-blue-200/50 active:scale-[0.99]"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg shadow-blue-300/50 transition-transform duration-300 group-hover:scale-110">
          <Camera className="h-7 w-7 text-white" />
        </div>
        <p className="mt-4 text-lg font-bold text-slate-800">
          Scatta foto
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Usa la fotocamera
        </p>
      </button>
      <label
        htmlFor={uploadInputId}
        className="group relative w-full cursor-pointer overflow-hidden rounded-[2rem] border-2 border-dashed border-blue-300 bg-gradient-to-b from-blue-50 to-blue-50/60 px-4 py-8 text-center transition-all hover:border-blue-400 hover:shadow-lg hover:shadow-blue-200/50 active:scale-[0.99]"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg shadow-blue-300/50 transition-transform duration-300 group-hover:scale-110">
          <ImageIcon className="h-7 w-7 text-white" />
        </div>
        <p className="mt-4 text-lg font-bold text-slate-800">
          Carica immagine
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Scegli una foto dal dispositivo
        </p>
      </label>
    </div>
  );
}
