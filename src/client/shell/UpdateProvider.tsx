import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "../ui/Toast.tsx";

interface UpdateState {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

const UpdateContext = createContext<UpdateState | null>(null);

const JUST_UPDATED_KEY = "health.just-updated";
/** An update found this soon after the page loaded is treated as found on opening the app. */
const JUST_OPENED_MS = 10_000;

/** Entering or editing a reading: reloading there would interrupt the user mid-entry. */
const isEntryScreen = (path: string) =>
  path === "/bp/new" ||
  /^\/bp\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path);

/**
 * Registers the service worker once for the whole app and applies updates by itself at safe
 * moments: when the app comes to the front or the user moves between screens, never while a
 * reading is being entered. A standalone iOS app resumed from memory makes no navigation
 * requests, so it also checks for a new version whenever it comes to the front.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const { pathname } = useLocation();
  const {
    needRefresh: [updateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration === undefined) return;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update().catch((err: unknown) => {
            console.error("Checking for an update failed", err);
          });
        }
      });
    },
  });

  const latestPath = useRef(pathname);
  useEffect(() => {
    latestPath.current = pathname;
  }, [pathname]);

  const applyUpdate = useCallback(() => {
    sessionStorage.setItem(JUST_UPDATED_KEY, "1");
    void updateServiceWorker(true);
  }, [updateServiceWorker]);

  useEffect(() => {
    if (sessionStorage.getItem(JUST_UPDATED_KEY) === null) return;
    sessionStorage.removeItem(JUST_UPDATED_KEY);
    toast({ text: "Updated to the latest version" });
  }, [toast]);

  // Safe moments: just after the app opens, moving to another screen, or the app coming to the
  // front. An update found while the user is looking at a screen waits for one of those rather
  // than reloading it under them.
  const pathWhenFound = useRef<string | null>(null);
  useEffect(() => {
    if (!updateAvailable) return;
    if (performance.now() < JUST_OPENED_MS && !isEntryScreen(latestPath.current)) {
      applyUpdate();
    } else {
      pathWhenFound.current = latestPath.current;
    }
  }, [updateAvailable, applyUpdate]);

  useEffect(() => {
    const found = pathWhenFound.current;
    if (updateAvailable && found !== null && pathname !== found && !isEntryScreen(pathname))
      applyUpdate();
  }, [updateAvailable, pathname, applyUpdate]);

  useEffect(() => {
    if (!updateAvailable) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !isEntryScreen(latestPath.current))
        applyUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [updateAvailable, applyUpdate]);

  return (
    <UpdateContext.Provider value={{ updateAvailable, applyUpdate }}>
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateState {
  const value = useContext(UpdateContext);
  if (value === null) throw new Error("useUpdate must be used inside UpdateProvider");
  return value;
}
