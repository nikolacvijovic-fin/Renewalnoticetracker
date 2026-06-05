import {
  logServerError,
  logServerInfo,
  logServerWarn,
  sanitizeOperationalError,
  sanitizeOperationalValue
} from "@/lib/observability/server-logger";

export type OperationalAlertSeverity = "P0" | "P1" | "P2" | "P3";
export type OperationalSensitivity = "public" | "internal" | "customer_sensitive" | "restricted";

export type OperationalEventInput = {
  eventName: string;
  severity: OperationalAlertSeverity;
  sensitivity: OperationalSensitivity;
  alert: boolean;
  organizationId?: string | null;
  actorUserId?: string | null;
  route?: string | null;
  action?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

export type OperationalEvent = {
  eventName: string;
  severity: OperationalAlertSeverity;
  sensitivity: OperationalSensitivity;
  alert: boolean;
  organizationId: string | null;
  actorUserId: string | null;
  route: string | null;
  action: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
  error: unknown;
  emittedAt: string;
};

type OperationalEventSink = (event: OperationalEvent) => void | Promise<void>;

let operationalEventSink: OperationalEventSink = defaultOperationalEventSink;

export function buildOperationalEvent(input: OperationalEventInput): OperationalEvent {
  return {
    eventName: input.eventName,
    severity: input.severity,
    sensitivity: input.sensitivity,
    alert: input.alert,
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    route: input.route ?? null,
    action: input.action ?? null,
    requestId: input.requestId ?? null,
    metadata: sanitizeOperationalValue(input.metadata ?? {}) as Record<string, unknown>,
    error: input.error ? sanitizeOperationalError(input.error) : null,
    emittedAt: new Date().toISOString()
  };
}

function defaultOperationalEventSink(event: OperationalEvent) {
  const logInput = {
    event: "monitoring.operational_event",
    organizationId: event.organizationId,
    actorUserId: event.actorUserId,
    route: event.route,
    action: event.action,
    requestId: event.requestId,
    metadata: {
      monitoring_event: event.eventName,
      severity: event.severity,
      sensitivity: event.sensitivity,
      alert: event.alert,
      ...event.metadata
    },
    error: event.error
  };

  if (event.severity === "P0" || event.severity === "P1") {
    logServerError(logInput);
    return;
  }

  if (event.severity === "P2") {
    logServerWarn(logInput);
    return;
  }

  logServerInfo(logInput);
}

export async function emitOperationalEvent(input: OperationalEventInput) {
  const event = buildOperationalEvent(input);
  await operationalEventSink(event);
  return event;
}

export function setOperationalEventSinkForTesting(sink: OperationalEventSink) {
  operationalEventSink = sink;
}

export function resetOperationalEventSinkForTesting() {
  operationalEventSink = defaultOperationalEventSink;
}
