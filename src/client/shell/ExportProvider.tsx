import { FileJson, FileSpreadsheet } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { localDateKey } from "../../shared/time.ts";
import { api } from "../api.ts";
import { useData } from "../data.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import { useToast } from "../ui/Toast.tsx";

type Prepared =
  | { state: "preparing" }
  | { state: "ready"; files: File[] }
  /** `files` is set when preparing worked but sharing failed, so they can still be downloaded. */
  | { state: "error"; message: string; files: File[] | null };

const ExportContext = createContext<(() => void) | null>(null);

function canShareFiles(files: File[]): boolean {
  // Older browsers and desktop Firefox don't support sharing files at all.
  const { canShare } = navigator as Partial<Navigator>;
  return typeof canShare === "function" && navigator.canShare({ files });
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${String(bytes)} B` : `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;

/**
 * Exports a full copy of the data through the phone's share sheet, e.g. to Google Drive.
 * Preparing the files and sharing them are separate taps because browsers only open the share
 * sheet straight after a tap, and fetching the data first would use that up.
 */
export function ExportProvider({ children }: { children: ReactNode }) {
  const { recordManualExport } = useData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>({ state: "preparing" });

  const prepare = useCallback(async () => {
    setPrepared({ state: "preparing" });
    try {
      const [json, csv] = await Promise.all([api.exportJson(), api.exportCsv()]);
      const day = localDateKey(new Date());
      setPrepared({
        state: "ready",
        files: [
          // Chrome on Android refuses to share .json files, but allows plain text. The content
          // is still JSON, which the restore script reads regardless of the extension.
          new File([json], `health-export-${day}.json.txt`, { type: "text/plain" }),
          new File([csv], `blood-pressure-${day}.csv`, { type: "text/csv" }),
        ],
      });
    } catch (err) {
      setPrepared({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
        files: null,
      });
    }
  }, []);

  const openExport = useCallback(() => {
    setOpen(true);
    void prepare();
  }, [prepare]);

  const finish = async () => {
    setOpen(false);
    try {
      await recordManualExport();
      toast({ text: "Export saved" });
    } catch (err) {
      toast({
        text: `Exported, but couldn't record it: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const downloadAll = (files: File[]) => {
    files.forEach(download);
    void finish();
  };

  const share = async (files: File[]) => {
    try {
      await navigator.share({ files, title: "Health data export" });
    } catch (err) {
      // Closing the share sheet without choosing anywhere isn't an error worth reporting.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPrepared({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
        files,
      });
      return;
    }
    await finish();
  };

  return (
    <ExportContext.Provider value={openExport}>
      {children}
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Export all data"
      >
        <p className="sheet-message">
          Save a copy somewhere safe, such as Google Drive. The JSON file can rebuild everything;
          the CSV opens in any spreadsheet.
        </p>
        {prepared.state === "preparing" && <p className="sheet-message">Preparing your files…</p>}
        {prepared.state === "error" && (
          <p className="entry-error">Couldn't export: {prepared.message}</p>
        )}
        {prepared.state === "ready" && (
          <div className="card list-card export-files">
            {prepared.files.map((file) => (
              <div key={file.name} className="list-row">
                <span className="list-icon tinted">
                  {file.name.endsWith(".json.txt") ? (
                    <FileJson size={16} aria-hidden="true" />
                  ) : (
                    <FileSpreadsheet size={16} aria-hidden="true" />
                  )}
                </span>
                <span className="list-text">
                  <span className="list-title">{file.name}</span>
                </span>
                <span className="list-value">{formatSize(file.size)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="sheet-actions">
          {prepared.state === "ready" &&
            (canShareFiles(prepared.files) ? (
              <button
                type="button"
                className="button block bp large"
                onClick={() => void share(prepared.files)}
              >
                Share…
              </button>
            ) : (
              <button
                type="button"
                className="button block bp large"
                onClick={() => {
                  downloadAll(prepared.files);
                }}
              >
                Download files
              </button>
            ))}
          {prepared.state === "error" &&
            (prepared.files === null ? (
              <button type="button" className="button block primary" onClick={() => void prepare()}>
                Try again
              </button>
            ) : (
              <button
                type="button"
                className="button block primary"
                onClick={() => {
                  downloadAll(prepared.files ?? []);
                }}
              >
                Download files instead
              </button>
            ))}
          <button
            type="button"
            className="button block plain"
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </button>
        </div>
      </Sheet>
    </ExportContext.Provider>
  );
}

export function useExport(): () => void {
  const open = useContext(ExportContext);
  if (open === null) throw new Error("useExport must be used inside ExportProvider");
  return open;
}
