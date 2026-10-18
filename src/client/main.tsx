import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { BpHistoryPage } from "./categories/bp/BpHistoryPage.tsx";
import { BpOverviewPage } from "./categories/bp/BpOverviewPage.tsx";
import { EditBpSessionPage, NewBpSessionPage } from "./categories/bp/entry/EntryFlow.tsx";
import { DataProvider } from "./data.tsx";
import { BrowsePage } from "./pages/BrowsePage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { SummaryPage } from "./pages/SummaryPage.tsx";
import { AppShell } from "./shell/AppShell.tsx";
import { UpdateProvider } from "./shell/UpdateProvider.tsx";
import { ToastProvider } from "./ui/Toast.tsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <UpdateProvider>
      <BrowserRouter>
        <ToastProvider>
          <DataProvider>
            <Routes>
              <Route path="bp/new" element={<NewBpSessionPage />} />
              <Route element={<AppShell />}>
                <Route index element={<SummaryPage />} />
                <Route path="browse" element={<BrowsePage />} />
                <Route path="bp" element={<BpOverviewPage />} />
                <Route path="bp/history" element={<BpHistoryPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<p className="empty">Page not found.</p>} />
              </Route>
              <Route path="bp/:id" element={<EditBpSessionPage />} />
            </Routes>
          </DataProvider>
        </ToastProvider>
      </BrowserRouter>
    </UpdateProvider>
  </StrictMode>,
);
