import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("vendor communication draft safety", () => {
  it("does not implement external vendor delivery or a send action", () => {
    const generator = readFileSync(join(process.cwd(), "lib/negotiation-workflow/vendor-communication-draft.ts"), "utf8");
    const actions = readFileSync(join(process.cwd(), "lib/actions/negotiation-workflow.ts"), "utf8");
    const ui = readFileSync(join(process.cwd(), "components/negotiation-workflow/negotiation-workflow-panel.tsx"), "utf8");

    expect(generator).not.toMatch(/resend|sendgrid|smtp|fetch\(/i);
    expect(actions).not.toMatch(/sendVendor|sendEmail|sendMessage|externalDelivery/i);
    expect(ui).not.toMatch(/>\s*Send\s*</);
    expect(ui).toContain("Approve for copy");
    expect(ui).toContain("no sending");
  });

  it("keeps generated draft bodies out of audit metadata", () => {
    const service = readFileSync(join(process.cwd(), "lib/negotiation-workflow/negotiation-workflow.ts"), "utf8");

    expect(service).toContain("eventType: \"vendor_communication_draft.created\"");
    expect(service).toContain("eventType: \"vendor_communication_draft.regenerated\"");
    expect(service).not.toMatch(/metadata:\s*\{[^}]*draft_body/s);
    expect(service).not.toMatch(/metadata:\s*\{[^}]*draftBody/s);
  });
});
