import { createContext, useContext, type ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

interface UpdateState {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

const UpdateContext = createContext<UpdateState | null>(null);

/**
 * Registers the service worker once for the whole app. A standalone iOS app resumed from memory
 * makes no navigation requests, so it checks for a new version whenever it comes to the front.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
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
  return (
    <UpdateContext.Provider
      value={{ updateAvailable, applyUpdate: () => void updateServiceWorker(true) }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateState {
  const value = useContext(UpdateContext);
  if (value === null) throw new Error("useUpdate must be used inside UpdateProvider");
  return value;
}
