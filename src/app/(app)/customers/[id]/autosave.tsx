"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Autosave shared by the map editor (with its device sheet) and the end users
// of the customer page.

// Runs a Server Action after the changes already queued; resolves with its
// result, or undefined when the request failed (the status shows the error).
export type Save = <T extends { error?: string }>(run: () => Promise<T>) => Promise<T | undefined>;

const SAVE_FAILED = "No se pudo guardar el último cambio. Revisá la conexión y recargá la página.";

// Changes are saved one after the other, in the order they were made: a
// connection is never sent before the device it points to.
export function useAutosave() {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Resolves with the action's result, or undefined when the request failed.
  const save: Save = useCallback(<T extends { error?: string }>(run: () => Promise<T>) => {
    setPending((count) => count + 1);
    const done = queue.current.then(run).then(
      (result) => {
        if (result.error) setError(result.error);
        return result;
      },
      () => {
        setError(SAVE_FAILED);
        return undefined;
      },
    );
    queue.current = done.then(() => setPending((count) => count - 1));
    return done;
  }, []);

  // Leaving while a change is on its way would lose it.
  useEffect(() => {
    if (pending === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  return { save, saving: pending > 0, error };
}

export function SaveStatus({ saving, error }: { saving: boolean; error: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-700 shadow-sm">
        {error}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-600 shadow-sm"
    >
      {saving ? "Guardando…" : "Guardado"}
    </p>
  );
}

// One record edited in place (an incident, an end user): kept here while it is
// typed and handed to `persist` as a whole when a change is committed (on blur,
// or right away for a date, a select or a checkbox). A draft, never saved
// yet, waits until `isComplete` (it has a title or a name); a saved record
// whose title is emptied goes back to what was saved.
export type RecordEditor<T> = {
  value: T;
  change: (changes: Partial<T>) => void;
  commit: () => void;
  commitNow: (changes: Partial<T>) => void;
  isDraft: boolean;
};

export function useRecordEditor<T extends object>(
  initial: T,
  {
    draft,
    tidy,
    isComplete,
    persist,
  }: {
    draft: boolean;
    tidy: (value: T) => T;
    isComplete: (value: T) => boolean;
    persist: (value: T) => void;
  },
): RecordEditor<T> {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState<T | null>(draft ? null : initial);

  const commit = (next: T = value) => {
    const clean = tidy(next);
    if (!isComplete(clean)) {
      setValue(saved ?? next);
      return;
    }
    setValue(clean);
    if (saved && JSON.stringify(clean) === JSON.stringify(saved)) return;
    setSaved(clean);
    persist(clean);
  };

  // Typing only changes the value; commitNow also saves it.
  const change = (changes: Partial<T>) => setValue((current) => ({ ...current, ...changes }));
  const commitNow = (changes: Partial<T>) => commit({ ...value, ...changes });

  return { value, change, commit: () => commit(), commitNow, isDraft: saved === null };
}
