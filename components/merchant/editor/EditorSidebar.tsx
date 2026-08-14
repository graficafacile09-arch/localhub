"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, AlertTriangle, Copy, FolderOpen, Store } from "lucide-react";
import { EDITOR_STEPS, type StepId, type StepStatus } from "./editor-steps";
import DuplicaNegozioWizard from "@/components/merchant/media/DuplicaNegozioWizard";

type Props = {
  activeStep: StepId;
  onSelect: (id: StepId) => void;
  statuses: Record<StepId, StepStatus>;
  storeName?: string;
  basePath?: string;
  storeId: string;
};

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "completata") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "attenzione") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <AlertTriangle className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400" />
  );
}

export default function EditorSidebar({ activeStep, onSelect, statuses, storeName, basePath = "/merchant", storeId }: Props) {
  const [showDuplica, setShowDuplica] = useState(false);

  return (
    <nav className="flex h-full flex-col">
      {showDuplica && (
        <DuplicaNegozioWizard
          storeId={storeId}
          storeName={storeName ?? "Negozio"}
          onClose={() => setShowDuplica(false)}
          editHref={`${basePath}/${storeId}/edit`}
        />
      )}

      {/* Intestazione negozio */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Store className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-800">{storeName || "Negozio"}</p>
          <p className="text-[10px] text-slate-400">Percorso guidato</p>
        </div>
      </div>

      {/* Stepper numerato */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          Configura il negozio
        </p>
        <ol className="space-y-1">
          {EDITOR_STEPS.map((s, i) => {
            const isActive = activeStep === s.id;
            const isPast = EDITOR_STEPS.findIndex((x) => x.id === activeStep) > i;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all duration-150 ${
                    isActive
                      ? "bg-blue-50 text-blue-700 shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : isPast
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.numero}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-xs font-semibold ${isActive ? "text-blue-700" : ""}`}>
                      {s.titolo}
                    </span>
                  </span>
                  <StatusBadge status={statuses[s.id]} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Collegamenti secondari */}
      <div className="space-y-0.5 border-t border-slate-100 px-2 py-3">
        <Link
          href={`${basePath}/${storeId}/media`}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="flex-1 truncate">Libreria media</span>
        </Link>
        <button
          type="button"
          onClick={() => setShowDuplica(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <Copy className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="flex-1 truncate">Duplica negozio</span>
        </button>
      </div>
    </nav>
  );
}
