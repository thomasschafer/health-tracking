import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { Layout } from "./components/Layout.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { DataProvider } from "./data.tsx";
import { HistoryPage } from "./pages/HistoryPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { EditSessionPage, NewSessionPage } from "./pages/SessionFormPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import "./styles.css";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <DataProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="bp/new" element={<NewSessionPage />} />
              <Route path="bp/history" element={<HistoryPage />} />
              <Route path="bp/:id" element={<EditSessionPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<p>Page not found.</p>} />
            </Route>
          </Routes>
        </DataProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
