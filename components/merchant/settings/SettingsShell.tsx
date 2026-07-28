"use client";

import { createContext, useContext, useState, useCallback } from "react";

type SettingsContextType = {
  setFormDirty: (id: string, dirty: boolean) => void;
  dirtyCount: number;
};

const SettingsCtx = createContext<SettingsContextType>({
  setFormDirty: () => {},
  dirtyCount: 0,
});

export function useSettingsContext() {
  return useContext(SettingsCtx);
}

export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const dirtyCount = Object.values(dirtyMap).filter(Boolean).length;

  const setFormDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyMap((prev) => {
      if (prev[id] === dirty) return prev;
      return { ...prev, [id]: dirty };
    });
  }, []);

  return (
    <SettingsCtx.Provider value={{ setFormDirty, dirtyCount }}>
      {children}
      {dirtyCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-50 flex justify-center pb-4 pointer-events-none md:bottom-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 shadow-lg backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            <span className="text-sm font-semibold text-amber-800">
              Modifiche non salvate
            </span>
          </div>
        </div>
      )}
    </SettingsCtx.Provider>
  );
}
