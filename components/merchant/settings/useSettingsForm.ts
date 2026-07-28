"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useSettingsForm<T>(initial: T) {
  const [data, setData] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const initialRef = useRef(initial);

  useEffect(() => {
    const dirty = JSON.stringify(data) !== JSON.stringify(initialRef.current);
    setIsDirty(dirty);
  }, [data]);

  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateAll = useCallback((newData: T) => {
    setData(newData);
  }, []);

  const resetInitial = useCallback(() => {
    initialRef.current = data;
    setIsDirty(false);
  }, [data]);

  const handleSubmit = useCallback(
    async (saveFn: (d: T) => Promise<void>) => {
      setSaving(true);
      setError(null);
      setSaved(false);
      try {
        await saveFn(data);
        initialRef.current = data;
        setIsDirty(false);
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : "Errore nel salvataggio.");
      }
    },
    [data]
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return {
    data,
    setData,
    updateField,
    updateAll,
    saving,
    saved,
    error,
    isDirty,
    handleSubmit,
    resetInitial,
    setError,
  };
}
