import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from './api';
import type { User } from './types';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface Conflict {
  updatedBy: User | null;
  updatedAt: number;
}

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

/**
 * Debounced autosave with optimistic concurrency.
 *
 * - Edits mark the doc dirty and schedule a save after a short pause.
 * - At most one request is in flight; edits made during a save trigger
 *   exactly one follow-up save with the latest content.
 * - A 409 pauses autosave and surfaces a conflict for the user to resolve
 *   (load the other person's version, or overwrite with ours).
 * - Network/server errors keep the doc dirty and retry automatically.
 */
export function useAutosave(docId: string, initialVersion: number, getHtml: () => string, enabled: boolean) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const version = useRef(initialVersion);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const paused = useRef(false); // true while a conflict is unresolved
  const timer = useRef<number | undefined>(undefined);
  const getHtmlRef = useRef(getHtml);
  getHtmlRef.current = getHtml;

  const save = useCallback(
    async (force = false) => {
      window.clearTimeout(timer.current);
      if (!enabled || (paused.current && !force)) return;
      if (inFlight.current) {
        queued.current = true;
        return;
      }
      if (!dirty.current && !force) return;

      inFlight.current = true;
      dirty.current = false;
      setStatus('saving');
      try {
        const meta = await api.saveContent(docId, getHtmlRef.current(), version.current, force);
        version.current = meta.version;
        paused.current = false;
        setConflict(null);
        setError(null);
        setLastSavedAt(meta.updatedAt);
        setStatus(dirty.current ? 'dirty' : 'saved');
      } catch (err) {
        dirty.current = true;
        if (err instanceof ApiError && err.status === 409) {
          paused.current = true;
          setConflict({
            updatedBy: (err.details.updatedBy as User | null) ?? null,
            updatedAt: Number(err.details.updatedAt) || Date.now(),
          });
          setStatus('conflict');
        } else {
          setError(err instanceof Error ? err.message : 'Save failed.');
          setStatus('error');
          // Permission errors won't fix themselves; everything else is retried.
          if (!(err instanceof ApiError && (err.status === 403 || err.status === 404))) {
            timer.current = window.setTimeout(() => void save(), RETRY_MS);
          }
        }
      } finally {
        inFlight.current = false;
        if (queued.current && !paused.current) {
          queued.current = false;
          if (dirty.current) void save();
        }
      }
    },
    [docId, enabled],
  );

  const markDirty = useCallback(() => {
    if (!enabled) return;
    dirty.current = true;
    if (!paused.current) setStatus((s) => (s === 'saving' ? s : 'dirty'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS);
  }, [enabled, save]);

  /** Call after replacing local content with the server's latest version. */
  const reset = useCallback((newVersion: number) => {
    window.clearTimeout(timer.current);
    version.current = newVersion;
    dirty.current = false;
    paused.current = false;
    setConflict(null);
    setError(null);
    setStatus('saved');
  }, []);

  // Warn before closing the tab with unsaved work; flush when leaving the page.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (dirty.current && !paused.current) void save();
      window.clearTimeout(timer.current);
    };
  }, [save]);

  // Stable function identities, so callers can use them in effect deps.
  const actions = useMemo(
    () => ({
      markDirty,
      reset,
      saveNow: () => save(),
      overwrite: () => save(true),
      currentVersion: () => version.current,
      /** True when there is nothing local that a remote refresh could clobber. */
      isIdle: () => !dirty.current && !inFlight.current && !paused.current,
    }),
    [markDirty, reset, save],
  );

  return { status, lastSavedAt, error, conflict, ...actions, actions };
}
