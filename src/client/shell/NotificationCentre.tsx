import { Bell } from "lucide-react";
import { useState } from "react";
import { formatAgo } from "../format.ts";
import { isSnoozed } from "../snoozes.ts";
import { Sheet } from "../ui/Sheet.tsx";
import { NoticeActionButton } from "./NoticeActionButton.tsx";
import { NoticeIcon } from "./NoticeIcon.tsx";
import { useNotices } from "./NoticesProvider.tsx";

/** A bell that opens the reminders sheet, with a dot while any reminder is waiting. */
export function NotificationCentre() {
  const { reminders, activeReminders, snoozes, snooze } = useNotices();
  const [open, setOpen] = useState(false);
  const count = activeReminders.length;
  const close = () => {
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="round-button bell"
        aria-label={count === 0 ? "Notifications" : `Notifications, ${String(count)} waiting`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Bell size={20} aria-hidden="true" />
        {count > 0 && <span className="bell-dot" aria-hidden="true" />}
      </button>
      <Sheet open={open} onClose={close} title="Notifications">
        {reminders.length === 0 ? (
          <p className="sheet-message">You're all caught up.</p>
        ) : (
          <div className="card list-card reminders">
            {reminders.map((notice) => {
              const snoozedUntil = isSnoozed(snoozes, notice.id, new Date())
                ? snoozes[notice.id]
                : undefined;
              return (
                <div
                  key={notice.id}
                  className={snoozedUntil === undefined ? "reminder" : "reminder snoozed"}
                >
                  <span className="list-icon tinted">
                    <NoticeIcon icon={notice.icon} />
                  </span>
                  <span className="reminder-text">
                    <span className="reminder-title">{notice.title}</span>
                    {notice.body !== null && <span className="reminder-body">{notice.body}</span>}
                    {snoozedUntil !== undefined && (
                      <span className="reminder-body">Snoozed, back {formatAgo(snoozedUntil)}</span>
                    )}
                    <span className="reminder-actions">
                      {notice.action !== null && (
                        <NoticeActionButton
                          action={notice.action}
                          className="button small bp"
                          onRun={close}
                        />
                      )}
                      {notice.snoozable && snoozedUntil === undefined && (
                        <button
                          type="button"
                          className="button small"
                          onClick={() => {
                            snooze(notice.id);
                          }}
                        >
                          Remind me in a week
                        </button>
                      )}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className="button block plain" onClick={close}>
          Done
        </button>
      </Sheet>
    </>
  );
}
