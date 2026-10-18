import { WifiOff } from "lucide-react";
import { useData } from "../data.tsx";
import { formatAgo } from "../format.ts";
import { NoticeActionButton } from "./NoticeActionButton.tsx";
import { NoticeIcon } from "./NoticeIcon.tsx";
import { useNotices } from "./NoticesProvider.tsx";

/**
 * Critical problems, pinned to the top until fixed. None can be dismissed, so unsynced readings
 * or broken backups can't go unnoticed. Reminders live in the notification centre instead.
 */
export function StatusStrip() {
  const { connection, cachedAt } = useData();
  const { critical } = useNotices();
  if (critical.length === 0 && connection !== "offline") return null;

  return (
    <div className="status-strip" role="status">
      {critical.map((notice) => (
        <div key={notice.id} className="notice critical">
          <span className="notice-icon">
            <NoticeIcon icon={notice.icon} />
          </span>
          <span className="notice-text">
            <strong>{notice.title}.</strong>
            {notice.body !== null && ` ${notice.body}`}
            {notice.action !== null && (
              <>
                {" "}
                <NoticeActionButton action={notice.action} className="link-button" />
              </>
            )}
          </span>
        </div>
      ))}
      {connection === "offline" && (
        <p className="offline-line">
          <WifiOff size={13} aria-hidden="true" />
          Can't reach the laptop{cachedAt !== null && ` · showing data from ${formatAgo(cachedAt)}`}
        </p>
      )}
    </div>
  );
}
