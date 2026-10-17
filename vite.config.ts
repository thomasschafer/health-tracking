import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Health",
        short_name: "Health",
        description: "Personal health tracking",
        start_url: "/",
        display: "standalone",
        background_color: "#f9f9f7",
        theme_color: "#2a78d6",
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
