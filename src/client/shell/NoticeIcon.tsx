import { CloudOff, Download, HardDriveUpload, RefreshCw, TriangleAlert } from "lucide-react";
import type { NoticeIcon as NoticeIconName } from "../notices.ts";

export function NoticeIcon({ icon, size = 16 }: { icon: NoticeIconName; size?: number }) {
  switch (icon) {
    case "alert":
      return <TriangleAlert size={size} aria-hidden="true" />;
    case "unsynced":
      return <CloudOff size={size} aria-hidden="true" />;
    case "download":
      return <Download size={size} aria-hidden="true" />;
    case "update":
      return <RefreshCw size={size} aria-hidden="true" />;
    case "backup":
      return <HardDriveUpload size={size} aria-hidden="true" />;
  }
}
