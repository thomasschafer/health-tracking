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
  const refreshing = useRef<Promise<void> | null>(null);

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
      setBackupStatus(status);
      setConnection("online");
      setCachedAt(null);
      setLoadError(null);
      await saveSnapshot(sessions, nextSettings);
    } catch (err) {
      setPending(await listPending());
      if (err instanceof UnreachableError) {
        setConnection("offline");
        const snapshot = await loadSnapshot();
        if (snapshot !== null) {
          setServerSessions((current) => (current.length === 0 ? snapshot.sessions : current));
          setSettings(snapshot.settings);
          setCachedAt(snapshot.savedAt);
        }
        return;
      }
      // The server is reachable but returned an error, which the banner reports.
      setConnection("online");
      setLoadError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [flushPending]);

  const refresh = useCallback((): Promise<void> => {
    refreshing.current ??= doRefresh().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [doRefresh]);

  useEffect(() => {
    void requestPersistentStorage();
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
      clearInterval(interval);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const addSession = useCallback(
    async (input: BpSessionInput): Promise<AddResult> => {
      // Persist locally first so the reading survives the app closing mid-request.
      await putPending({ input, queuedAt: new Date().toISOString(), rejection: null });
      setPending(await listPending());
      try {
        await api.createSession(input);
        await removePending(input.id);
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
      await refresh();
      return "saved";
    },
    [refresh],
  );

  const updateSession = useCallback(
    async (input: BpSessionInput) => {
      await api.updateSession(input);
      await refresh();
    },
    [refresh],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await api.deleteSession(id);
      await refresh();
    },
    [refresh],
  );

  const restoreSession = useCallback(
    async (id: string) => {
      await api.restoreSession(id);
      await refresh();
    },
    [refresh],
  );

  const saveSettings = useCallback(
    async (next: Settings) => {
      setSettings(await api.saveSettings(next));
      await refresh();
    },
    [refresh],
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
