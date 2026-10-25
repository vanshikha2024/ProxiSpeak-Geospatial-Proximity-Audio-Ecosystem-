// ---------------------------------------------------------------
// playwright.config.js - settings for the two-browser audio check.
// It starts the backend and the frontend for you.
// Run with:  npm run test:audio
// ---------------------------------------------------------------
import { defineConfig } from "@playwright/test";

// Optional: point to a Chrome you already have (PW_CHROME=...).
// If it is not set, Playwright uses its own browser (see README).
const chromePath = process.env.PW_CHROME || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    launchOptions: {
      executablePath: chromePath,
      // Fake camera and microphone, so the test needs no real hardware
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
    {
      command: "node index.js",
      cwd: "../server",
      url: "http://localhost:5000/health",
      reuseExistingServer: true,
    },
  ],
});
