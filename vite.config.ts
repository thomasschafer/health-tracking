import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function appVersion(): string {
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const date = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(new Date());
  return `${commit} · ${date}`;
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  plugins: [
    react(),
    VitePWA({
      // Updates wait for the user to tap "Update now", so a reload never interrupts entering a reading.
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Health",
        short_name: "Health",
        description: "Personal health tracking",
        start_url: "/",
        display: "standalone",
        // Android uses these for the installed app's splash screen and system navigation bar.
        // Manifests can't vary by colour scheme, so they match the dark theme.
        background_color: "#000000",
        theme_color: "#000000",
        // Long-pressing the app icon on Android offers these.
        shortcuts: [
          {
            name: "New blood pressure reading",
            short_name: "New reading",
            url: "/bp/new",
            icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // API responses must never come from the service worker cache; the app keeps its own
        // offline copy so it can show how stale it is.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
});
