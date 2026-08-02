import { describe, expect, it } from "vitest";
import { createDomainEvent, sanitizeDomainEventMetadata } from "@/lib/events/domain-event-bus";
import { createInMemoryDomainEventRecorder } from "@/lib/events/domain-event-recorder";

describe("domain event bus foundation", () => {
  it("builds deterministic safe event envelopes with organization and idempotency context", () => {
    const event = createDomainEvent({
      name: "saas.metadata_conflict_resolved",
      organizationId: "org-1",
      actorUserId: "user-1",
      entityType: "saas_metadata_conflict_resolution",
      entityId: "resolution-1",
      occurredAt: "2026-08-02T10:00:00.000Z",
      correlationKey: "term-1",
      metadata: {
        fieldName: "notice_deadline_date",
        rawContractText: "raw contract body should not survive",
        nested: {
          providerPayload: { secret: "secret token" },
          count: 2
        }
      }
    });

    expect(event).toEqual(expect.objectContaining({
      name: "saas.metadata_conflict_resolved",
      category: "saas",
      organizationId: "org-1",
      actorUserId: "user-1",
      entityType: "saas_metadata_conflict_resolution",
      entityId: "resolution-1",
      occurredAt: "2026-08-02T10:00:00.000Z",
      correlationKey: "term-1",
      idempotencyKey: "org-1:saas.metadata_conflict_resolved:saas_metadata_conflict_resolution:resolution-1:none:none:term-1"
    }));
    expect(event.metadata).toEqual({
      fieldName: "notice_deadline_date",
      nested: {
        count: 2
      }
    });
  });

  it("recursively strips sensitive customer/provider data from event metadata", () => {
    const metadata = sanitizeDomainEventMetadata({
      safeId: "contract-1",
      values: [
        { source: "import", noteText: "private note should not survive" },
        "provider payload with secret token"
      ],
      amount: 50000
    });

    expect(JSON.stringify(metadata)).not.toMatch(/private note|provider payload|secret token|noteText/i);
    expect(metadata).toEqual({
      safeId: "contract-1",
      values: [
        { source: "import" },
        "[redacted]"
      ],
      amount: 50000
    });
  });

  it("deduplicates in-memory recording by idempotency key", async () => {
    const recorder = createInMemoryDomainEventRecorder();
    await recorder.record({
      name: "saas.import_row_activated",
      organizationId: "org-1",
      entityType: "saas_import_row",
      entityId: "row-1",
      idempotencyKey: "same-event"
    });
    await recorder.record({
      name: "saas.import_row_activated",
      organizationId: "org-1",
      entityType: "saas_import_row",
      entityId: "row-1",
      idempotencyKey: "same-event"
    });

    expect(recorder.recordedEvents()).toHaveLength(1);
  });
});
