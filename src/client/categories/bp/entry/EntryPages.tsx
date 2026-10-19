import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { useData } from "../../../data.tsx";
import { clearDraft, loadDraft } from "./draft.ts";
import { EntryFlow, type EntryInitial } from "./EntryFlow.tsx";
import { emptyRow, rowFromReading } from "./model.ts";

/** The entry screen with just a close button, for while it's loading or can't be shown. */
function EntryShell({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  return (
    <div className="entry" aria-busy={children === undefined}>
      <header className="entry-header">
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={24} aria-hidden="true" />
        </button>
      </header>
      {children !== undefined && <p className="entry-message">{children}</p>}
    </div>
  );
}

export function NewBpSessionPage() {
  const { settings, settingsReady } = useData();
  const navigate = useNavigate();
  const [restored, setRestored] = useState(() => loadDraft(new Date()));
  const [attempt, setAttempt] = useState(0);
  // Without a draft, wait for the stored settings so the number of readings is right.
  if (restored === null && !settingsReady) {
    return <EntryShell onClose={() => void navigate(-1)} />;
  }
  return (
    <NewEntry
      key={attempt}
      restored={restored}
      readingsPerSession={settings.readingsPerSession}
      restSeconds={settings.restTimerSeconds}
      onStartOver={() => {
        clearDraft();
        setRestored(null);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

function NewEntry({
  restored,
  readingsPerSession,
  restSeconds,
  onStartOver,
}: {
  restored: EntryInitial | null;
  readingsPerSession: number;
  restSeconds: number;
  onStartOver: () => void;
}) {
  // Created once, so the ID and time stay stable while the reading is entered. The time
  // reflects when entry started rather than when it was saved.
  const [start] = useState<EntryInitial>(
    () =>
      restored ?? {
        id: crypto.randomUUID(),
        takenAt: new Date().toISOString(),
        rows: Array.from({ length: readingsPerSession }, emptyRow),
        note: "",
      },
  );
  return (
    <EntryFlow
      mode="new"
      initial={start}
      restored={restored !== null}
      restSeconds={restSeconds}
      onStartOver={onStartOver}
    />
  );
}

export function EditBpSessionPage() {
  const { id } = useParams();
  const { sessions, connection, settings } = useData();
  const navigate = useNavigate();
  const session = sessions.find((s) => s.id === id);
  if (session === undefined || session.pending) {
    return (
      <EntryShell onClose={() => void navigate("/bp")}>
        {connection === "loading"
          ? "Loading…"
          : session?.pending === true
            ? "This reading hasn't synced yet. You can edit it once it has reached the laptop."
            : "Reading not found."}
      </EntryShell>
    );
  }
  return (
    <EntryFlow
      key={session.id}
      mode="edit"
      initial={{
        id: session.id,
        takenAt: session.takenAt,
        rows: session.readings.map(rowFromReading),
        note: session.note ?? "",
      }}
      restored={false}
      restSeconds={settings.restTimerSeconds}
      onStartOver={null}
    />
  );
}
