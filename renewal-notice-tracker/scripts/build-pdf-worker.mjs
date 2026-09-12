import { build } from "esbuild";

await build({
  entryPoints: ["scripts/pdf-worker-entry.ts"],
  outfile: "dist/pdf-worker.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  // document-parser uses createRequire(import.meta.url). Preserve that module
  // location in the CommonJS bundle used by the existing Next server imports.
  define: { "import.meta.url": "workerModuleUrl" },
  banner: { js: 'const workerModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
  target: "node20",
  packages: "external",
  tsconfig: "tsconfig.json"
});
