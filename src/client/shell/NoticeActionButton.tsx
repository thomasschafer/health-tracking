import { Link } from "react-router";
import type { NoticeAction } from "../notices.ts";
import { useExport } from "./ExportProvider.tsx";
import { useUpdate } from "./UpdateProvider.tsx";

/** Renders a notice's action as a link or button. `onRun` fires first, e.g. to close a sheet. */
export function NoticeActionButton({
  action,
  className,
  onRun,
}: {
  action: NoticeAction;
  className: string;
  onRun?: () => void;
}) {
  const openExport = useExport();
  const { applyUpdate } = useUpdate();
  switch (action.kind) {
    case "link":
      return (
        <Link to={action.to} className={className} onClick={onRun}>
          {action.label}
        </Link>
      );
    case "export":
    case "update":
      return (
        <button
          type="button"
          className={className}
          onClick={() => {
            onRun?.();
            if (action.kind === "export") openExport();
            else applyUpdate();
          }}
        >
          {action.label}
        </button>
      );
  }
}
