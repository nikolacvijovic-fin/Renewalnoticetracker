import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./tests/vitest.setup.ts",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    // Keep the full release suite deterministic on constrained CI and Windows hosts.
    // Excessive worker fan-out can leave timed-out async mocks running into later cases.
    maxWorkers: 4,
    minWorkers: 1
  },
  resolve: {
    alias: {
      "@": path.resolve(".")
    }
  }
});
