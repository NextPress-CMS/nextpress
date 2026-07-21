"use client";
import { useEffect, useRef, useCallback } from "react";

export function useAutosave(isDirty: boolean, onSave: () => Promise<void>, delay = 5000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try { await onSave(); } finally { savingRef.current = false; }
  }, [onSave]);

  useEffect(() => {
    if (!isDirty) return;
    timerRef.current = setTimeout(save, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isDirty, save, delay]);
}
