import { defineConfig } from "@playwright/test";
import path from "node:path";

const baseURL =
  process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const storageStatePath = process.env.E2E_STORAGE_STATE_PATH
  ? path.resolve(process.env.E2E_STORAGE_STATE_PATH)
  : undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  reporter: "list",
  use: {
    baseURL,
    storageState: storageStatePath,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  }
});
