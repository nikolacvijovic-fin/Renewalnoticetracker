import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("configuration access boundary", () => {
  it("keeps critical runtime config access centralized instead of using raw process.env", () => {
    const criticalRuntimeFiles = [
      "lib/supabase/server.ts",
      "lib/supabase/admin.ts",
      "lib/supabase/client.ts",
      "middleware.ts",
      "lib/billing/config.ts",
      "lib/internal-route-auth.ts",
      "lib/http/route-handler.ts",
      "lib/email/send-reminder.ts",
      "lib/email/action-tokens.ts",
      "lib/ai/extract-contract.ts",
      "lib/ocr/provider.ts",
      "lib/ocr/providers/openai.ts"
    ];

    for (const file of criticalRuntimeFiles) {
      const source = readProjectFile(file);
      expect(source, `${file} should not read process.env directly`).not.toMatch(
        /process\.env/
      );
      expect(
        source,
        `${file} should use the centralized config module`
      ).toMatch(/@\/lib\/config/);
    }
  });

  it("keeps the legacy env adapter as a compatibility layer over config only", () => {
    const source = readProjectFile("lib/env.ts");

    expect(source).toContain("@/lib/config");
    expect(source).not.toMatch(/process\.env/);
  });
});
