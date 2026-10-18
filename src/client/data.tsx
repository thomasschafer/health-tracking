import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BackupStatus } from "../shared/backup.ts";
import { bpSessionInputSchema, type BpSession, type BpSessionInput } from "../shared/bp.ts";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings.ts";
import { api, ApiError, UnreachableError } from "./api.ts";
import {
  listPending,
  loadSnapshot,
  putPending,
  removePending,
  requestPersistentStorage,
  saveSnapshot,
  type PendingSession,
} from "./local-store.ts";

export type Connection = "loading" | "online" | "offline";

export interface DisplaySession extends BpSession {
  /** True for sessions saved on this device that haven't reached the server yet. */
  pending: boolean;
}

export type AddResult = "saved" | "queued";

interface DataContextValue {
  connection: Connection;
  /** When the shown data was last fetched from the server, if it came from the offline cache. */
  cachedAt: string | null;
  sessions: DisplaySession[];
  pending: PendingSession[];
  settings: Settings;
  /** False until settings have come from the server or the offline cache. */
  settingsReady: boolean;
  backupStatus: BackupStatus | null;
  loadError: string | null;
  refresh: () => Promise<void>;
  addSession: (input: BpSessionInput) => Promise<AddResult>;
  updateSession: (input: BpSessionInput) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  restoreSession: (id: string) => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  retryPending: (id: string) => Promise<void>;
  discardPending: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const REFRESH_INTERVAL_MS = 60_000;
const SETTINGS_GRACE_MS = 1_500;

const isRetryable = (err: unknown): boolean =>
  err instanceof UnreachableError || (err instanceof ApiError && err.status >= 500);

function pendingToDisplay(p: PendingSession): DisplaySession {
  const input = bpSessionInputSchema.parse(p.input);
  return { ...input, createdAt: p.queuedAt, updatedAt: p.queuedAt, pending: true };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection>("loading");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [serverSessions, setServerSessions] = useState<BpSession[]>([]);
  const [pending, setPending] = useState<PendingSession[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const settingsFromServer = useRef(false);
  const refreshing = useRef<Promise<void> | null>(null);

  /** Shows cached data. Returns whether there was any. */
  const applySnapshot = useCallback(async (): Promise<boolean> => {
    const snapshot = await loadSnapshot();
    if (snapshot === null) return false;
    setServerSessions((current) => (current.length === 0 ? snapshot.sessions : current));
    setSettings((current) => (settingsFromServer.current ? current : snapshot.settings));
    setCachedAt(snapshot.savedAt);
    return true;
  }, []);

  /** Sends queued sessions in order, stopping at the first one the server can't take yet. */
  const flushPending = useCallback(async (): Promise<void> => {
    for (const p of await listPending()) {
      if (p.rejection !== null) continue;
      try {
        await api.createSession(p.input);
        await removePending(p.input.id);
      } catch (err) {
        if (isRetryable(err)) break;
        const message = err instanceof Error ? err.message : String(err);
        await putPending({ ...p, rejection: message });
      }
    }
    setPending(await listPending());
  }, []);

  const doRefresh = useCallback(async (): Promise<void> => {
    try {
      await flushPending();
      const [sessions, nextSettings, status] = await Promise.all([
        api.listSessions(),
        api.getSettings(),
        api.backupStatus(),
      ]);
      setServerSessions(sessions);
      setSettings(nextSettings);
      settingsFromServer.current = true;
      setBackupStatus(status);
      setSettingsReady(true);
      setConnection("online");
      setCachedAt(null);
      setLoadError(null);
      await saveSnapshot(sessions, nextSettings);
    } catch (err) {
      setPending(await listPending());
      if (err instanceof UnreachableError) {
        // Cached settings are applied before the connection state changes, so screens waiting
        // on it never render with default settings.
        await applySnapshot();
        setSettingsReady(true);
        setConnection("offline");
        return;
      }
      // The server is reachable but returned an error, which the banner reports.
      setSettingsReady(true);
      setConnection("online");
      setLoadError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [flushPending, applySnapshot]);

  const refresh = useCallback((): Promise<void> => {
    refreshing.current ??= doRefresh().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [doRefresh]);

  /**
   * Refreshes after a write that has already succeeded. A failure here is reported by the
   * banner rather than the write, so a saved reading is never shown as unsaved.
   */
  const refreshAfterWrite = useCallback(async (): Promise<void> => {
    await refresh().catch((err: unknown) => {
      console.error("Refresh after a successful write failed", err);
    });
  }, [refresh]);

  useEffect(() => {
    void requestPersistentStorage();
    // Show cached data straight away rather than waiting for the network, which can take a
    // while to give up when the laptop is asleep. State is only set after the cache is read,
    // so this doesn't cascade renders as the rule assumes.
    // Cached settings may be stale (e.g. changed just before a reload), so the server gets a
    // moment to answer before screens that depend on them fall back to the cache.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const cached = applySnapshot();
    const grace = setTimeout(() => {
      void cached.then((found) => {
        if (found) setSettingsReady(true);
      });
    }, SETTINGS_GRACE_MS);
    const run = () => {
      refresh().catch((err: unknown) => {
        console.error(err);
      });
    };
    run();
    const interval = setInterval(run, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(grace);
      clearInterval(interval);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, applySnapshot]);

  const addSession = useCallback(
    async (input: BpSessionInput): Promise<AddResult> => {
      // Persist locally first so the reading survives the app closing mid-request.
      await putPending({ input, queuedAt: new Date().toISOString(), rejection: null });
      setPending(await listPending());
      try {
        await api.createSession(input);
        await removePending(input.id);
        setPending(await listPending());
      } catch (err) {
        if (isRetryable(err)) {
          setConnection("offline");
          setPending(await listPending());
          return "queued";
        }
        await removePending(input.id);
        setPending(await listPending());
        throw err;
      }
      await refreshAfterWrite();
      return "saved";
    },
    [refreshAfterWrite],
  );

  const updateSession = useCallback(
    async (input: BpSessionInput) => {
      const updated = await api.updateSession(input);
      setServerSessions((current) => current.map((s) => (s.id === updated.id ? updated : s)));
      await refreshAfterWrite();
    },
    [refreshAfterWrite],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await api.deleteSession(id);
      setServerSessions((current) => current.filter((s) => s.id !== id));
      void refreshAfterWrite();
    },
    [refreshAfterWrite],
  );

  const restoreSession = useCallback(
    async (id: string) => {
      await api.restoreSession(id);
      await refreshAfterWrite();
    },
    [refreshAfterWrite],
  );

  const saveSettings = useCallback(
    async (next: Settings) => {
      setSettings(await api.saveSettings(next));
      settingsFromServer.current = true;
      await refreshAfterWrite();
    },
    [refreshAfterWrite],
  );

  const retryPending = useCallback(
    async (id: string) => {
      const p = (await listPending()).find((x) => x.input.id === id);
      if (p === undefined) throw new Error(`No unsynced reading with ID ${id}`);
      await putPending({ ...p, rejection: null });
      await refresh();
    },
    [refresh],
  );

  const discardPending = useCallback(async (id: string) => {
    await removePending(id);
    setPending(await listPending());
  }, []);

  const sessions = useMemo(() => {
    const serverIds = new Set(serverSessions.map((s) => s.id));
    return [
      ...serverSessions.map((s) => ({ ...s, pending: false })),
      ...pending.filter((p) => !serverIds.has(p.input.id)).map(pendingToDisplay),
    ].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }, [serverSessions, pending]);

  const value: DataContextValue = {
    connection,
    cachedAt,
    sessions,
    pending,
    settings,
    settingsReady,
    backupStatus,
    loadError,
    refresh,
    addSession,
    updateSession,
    deleteSession,
    restoreSession,
    saveSettings,
    retryPending,
    discardPending,
  };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (value === null) {
    throw new Error("useData must be used inside DataProvider");
  }
  return value;
}
