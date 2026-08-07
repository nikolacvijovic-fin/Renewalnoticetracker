import type {
  DomainEvent,
  DomainEventCategory,
  DomainEventInput,
  SafeDomainEventMetadata,
  SafeDomainEventMetadataValue
} from "@/lib/events/domain-event-types";

const FORBIDDEN_METADATA_KEY_PATTERN =
  /(raw|body|text|content|note|notes|payload|provider|secret|token|password|private|scraped|storage|path|file|document|email_body|assertion|certificate)/i;
const SENSITIVE_STRING_PATTERN =
  /(raw contract|contract body|ocr output|provider payload|private note|secret|token|bearer|saml assertion|oidc token|storage path|uploaded document|email body|scraped personal)/i;

export function domainEventCategory(name: string): DomainEventCategory {
  const [category] = name.split(".");
  if (
    category === "renewal" ||
    category === "saas" ||
    category === "trust" ||
    category === "ai" ||
    category === "rules" ||
    category === "decision" ||
    category === "action" ||
    category === "intelligence"
  ) {
    return category;
  }
  return "rules";
}

function sanitizeValue(value: unknown): SafeDomainEventMetadataValue | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return SENSITIVE_STRING_PATTERN.test(value) ? "[redacted]" : value.slice(0, 500);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item): item is SafeDomainEventMetadataValue => item !== undefined);
  }
  if (typeof value === "object") {
    const sanitized: SafeDomainEventMetadata = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (FORBIDDEN_METADATA_KEY_PATTERN.test(key)) continue;
      const safeValue = sanitizeValue(nestedValue);
      if (safeValue !== undefined) sanitized[key] = safeValue;
    }
    return sanitized;
  }
  return String(value).slice(0, 500);
}

export function sanitizeDomainEventMetadata(metadata: Record<string, unknown> | null | undefined): SafeDomainEventMetadata {
  const sanitized = sanitizeValue(metadata ?? {});
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized
    : {};
}

export function createDomainEvent(input: DomainEventInput): DomainEvent {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const correlationKey = input.correlationKey ?? null;
  const idempotencyKey =
    input.idempotencyKey ??
    [
      input.organizationId,
      input.name,
      input.entityType,
      input.entityId ?? "none",
      input.decisionId ?? "none",
      input.ruleId ?? "none",
      correlationKey ?? occurredAt
    ].join(":");

  return {
    name: input.name,
    category: domainEventCategory(input.name),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    occurredAt,
    correlationKey,
    idempotencyKey,
    decisionId: input.decisionId ?? null,
    ruleId: input.ruleId ?? null,
    source: input.source ?? input.name.split(".")[0] ?? null,
    metadata: sanitizeDomainEventMetadata(input.metadata)
  };
}

export type DomainEventSink = (event: DomainEvent) => void | Promise<void>;

export class LocalDomainEventBus {
  private readonly sinks: DomainEventSink[];

  constructor(sinks: DomainEventSink[] = []) {
    this.sinks = sinks;
  }

  async publish(input: DomainEventInput): Promise<DomainEvent> {
    const event = createDomainEvent(input);
    for (const sink of this.sinks) {
      await sink(event);
    }
    return event;
  }
}
