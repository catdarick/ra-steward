import { defineConfig } from "@playwright/test";
import { backendUrl, uiPort } from "./dev.config.ts";

// Use a running example backend, or start one from an explicitly supplied checkout.
const stewardDir = process.env.STEWARD_DIR;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${uiPort}`, viewport: { width: 1400, height: 900 }, timezoneId: "Europe/Belgrade" },
  webServer: [
    ...(stewardDir ? [{
      command: "task server",
      cwd: stewardDir,
      url: `${backendUrl}/admin/`,
      reuseExistingServer: true,
      timeout: 120_000,
    }] : []),
    {
      command: "npx vite",
      cwd: "demo",
      url: `http://127.0.0.1:${uiPort}/`,
      reuseExistingServer: true,
    },
  ],
});
