import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useData } from "../data.tsx";
import { buildNotices, type Notice } from "../notices.ts";
import { isSnoozed, loadSnoozes, saveSnoozes, type Snoozes } from "../snoozes.ts";
import { useUpdate } from "./UpdateProvider.tsx";

const SNOOZE_DAYS = 7;

interface NoticesState {
  critical: Notice[];
  reminders: Notice[];
  /** Reminders that haven't been snoozed, which light up the bell. */
  activeReminders: Notice[];
  snoozes: Snoozes;
  snooze: (id: string) => void;
}

const NoticesContext = createContext<NoticesState | null>(null);

export function NoticesProvider({ children }: { children: ReactNode }) {
  const { pending, loadError, backupStatus } = useData();
  const { updateAvailable } = useUpdate();
  const [snoozes, setSnoozes] = useState<Snoozes>(loadSnoozes);

  const snooze = useCallback((id: string) => {
    setSnoozes((current) => {
      const next = {
        ...current,
        [id]: new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString(),
      };
      saveSnoozes(next);
      return next;
    });
  }, []);

  const value = useMemo(() => {
    const notices = buildNotices({ pending, loadError, backupStatus, updateAvailable });
    const reminders = notices.filter((n) => n.level === "reminder");
    const now = new Date();
    return {
      critical: notices.filter((n) => n.level === "critical"),
      reminders,
      activeReminders: reminders.filter((n) => !isSnoozed(snoozes, n.id, now)),
      snoozes,
      snooze,
    };
  }, [pending, loadError, backupStatus, updateAvailable, snoozes, snooze]);

  return <NoticesContext.Provider value={value}>{children}</NoticesContext.Provider>;
}

export function useNotices(): NoticesState {
  const value = useContext(NoticesContext);
  if (value === null) throw new Error("useNotices must be used inside NoticesProvider");
  return value;
}
