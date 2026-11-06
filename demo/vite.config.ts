import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { backendUrl, uiPort } from "../dev.config.ts";
import { fileURLToPath } from "node:url";

// The demo proxies /admin to STEWARD_URL (or localhost on PORT, 8080 by default).

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Keep source hot reload in development; production builds consume the compiled package.
  resolve: command === "serve" ? {
    alias: { "ra-steward": fileURLToPath(new URL("../packages/ra-steward/src/index.tsx", import.meta.url)) },
  } : {},
  server: {
    host: "127.0.0.1",
    port: uiPort,
    strictPort: true,
    proxy: { "/admin": backendUrl },
  },
  preview: {
    host: "127.0.0.1",
    port: uiPort,
    strictPort: true,
    proxy: { "/admin": backendUrl },
  },
}));
