import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function walkFiles(root: string, files: string[] = []) {
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next"].includes(entry.name)) continue;
      walkFiles(fullPath, files);
    } else if (/\.(ts|tsx|md)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function normalize(filePath: string) {
  return path.relative(projectRoot, filePath).replaceAll("\\", "/");
}

describe("multi-language runtime boundary", () => {
  it("keeps customer-facing app routes from importing service implementation files", () => {
    const customerAppFiles = walkFiles(path.join(projectRoot, "app"))
      .map((filePath) => ({
        relativePath: normalize(filePath),
        source: fs.readFileSync(filePath, "utf8")
      }))
      .filter(({ relativePath }) => !relativePath.startsWith("app/admin/"));
    const forbiddenImport = /from\s+["'](?:@\/)?services\/(?:python-intelligence|go-worker|java-enterprise-connectors|r-analytics)\//;
    const offenders = customerAppFiles
      .filter(({ source }) => forbiddenImport.test(source))
      .map(({ relativePath }) => relativePath);

    expect(offenders).toEqual([]);
  });

  it("keeps service access behind typed TypeScript clients or registries", () => {
    expect(read("lib/add-ons/python-intelligence-client.ts")).toContain("python");
    expect(read("lib/add-ons/go-worker-client.ts")).toContain("go");
    expect(read("lib/add-ons/java-enterprise-client.ts")).toContain("java");
    expect(read("lib/learning/language-subsystems.ts")).toContain("services/r-analytics");
  });

  it("keeps the learning roadmap internal-only", () => {
    const source = read("app/admin/learning-roadmap/page.tsx");

    expect(source).toContain("requireInternalRole");
    expect(source).not.toMatch(/requireOrganization\(/);
  });

  it("documents scaffolded services as not production-ready where appropriate", () => {
    const docs = [
      read("docs/MULTI_LANGUAGE_ENTERPRISE_LEARNING_ARCHITECTURE.md"),
      read("services/python-intelligence/README.md"),
      read("services/go-worker/README.md"),
      read("services/java-enterprise-connectors/README.md"),
      read("services/r-analytics/README.md")
    ].join("\n");

    expect(docs).toMatch(/not production-ready|Scaffolded|scaffolded/i);
    expect(docs).toContain("R consumes exported/reporting data only");
    expect(docs).toContain("Do not make Node release checks depend on R");
  });
});
