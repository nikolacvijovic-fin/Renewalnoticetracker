import {
  logServerError,
  logServerInfo,
  logServerWarn,
  sanitizeOperationalError,
  sanitizeOperationalValue
} from "@/lib/observability/server-logger";
import { getAppConfig } from "@/lib/config";
import { createHmac } from "node:crypto";

export type OperationalAlertSeverity = "P0" | "P1" | "P2" | "P3";
export type OperationalSensitivity = "public" | "internal" | "customer_sensitive" | "restricted";
export type OperationalEventSinkProvider = "structured_log" | "structured_log_and_webhook";

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

export type OperationalEventSink = (event: OperationalEvent) => void | Promise<void>;

let operationalEventSinkOverride: OperationalEventSink | null = null;
let configuredOperationalEventSink:
  | {
      provider: OperationalEventSinkProvider;
      sink: OperationalEventSink;
    }
  | null = null;

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

export function structuredLogOperationalEventSink(event: OperationalEvent) {
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

export function buildAlertWebhookPayload(event: OperationalEvent) {
  return sanitizeOperationalValue({
    event_name: event.eventName,
    severity: event.severity,
    sensitivity: event.sensitivity,
    alert: event.alert,
    organization_id: event.organizationId,
    actor_user_id: event.actorUserId,
    route: event.route,
    action: event.action,
    request_id: event.requestId,
    metadata: event.metadata,
    error: event.error,
    emitted_at: event.emittedAt
  }) as Record<string, unknown>;
}

function signAlertWebhookPayload(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function alertWebhookOperationalEventSink(event: OperationalEvent) {
  if (!event.alert) return;

  const config = getAppConfig().operations;
  if (!config.monitoringAlertWebhookUrl) {
    logServerWarn({
      event: "monitoring.alert_webhook_missing_config",
      metadata: {
        monitoring_event: event.eventName,
        severity: event.severity
      }
    });
    return;
  }

  const payload = buildAlertWebhookPayload(event);
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-noticecontrol-event": event.eventName,
    "x-noticecontrol-severity": event.severity
  };

  if (config.monitoringAlertWebhookSigningSecret) {
    headers["x-noticecontrol-signature-sha256"] = signAlertWebhookPayload(
      body,
      config.monitoringAlertWebhookSigningSecret
    );
  }

  try {
    const response = await fetch(config.monitoringAlertWebhookUrl, {
      method: "POST",
      headers,
      body
    });

    if (!response.ok) {
      logServerWarn({
        event: "monitoring.alert_webhook_delivery_failed",
        metadata: {
          monitoring_event: event.eventName,
          severity: event.severity,
          status: response.status
        }
      });
    }
  } catch (error) {
    logServerError({
      event: "monitoring.alert_webhook_delivery_error",
      metadata: {
        monitoring_event: event.eventName,
        severity: event.severity
      },
      error
    });
  }
}

export async function structuredLogAndWebhookOperationalEventSink(event: OperationalEvent) {
  structuredLogOperationalEventSink(event);
  await alertWebhookOperationalEventSink(event);
}

export function resolveOperationalEventSink(
  provider: OperationalEventSinkProvider
): OperationalEventSink {
  if (provider === "structured_log") {
    return structuredLogOperationalEventSink;
  }

  if (provider === "structured_log_and_webhook") {
    return structuredLogAndWebhookOperationalEventSink;
  }

  return structuredLogOperationalEventSink;
}

function getOperationalEventSink() {
  if (operationalEventSinkOverride) {
    return operationalEventSinkOverride;
  }

  const provider = getAppConfig().operations.monitoringEventSink;
  if (!configuredOperationalEventSink || configuredOperationalEventSink.provider !== provider) {
    configuredOperationalEventSink = {
      provider,
      sink: resolveOperationalEventSink(provider)
    };
  }

  return configuredOperationalEventSink.sink;
}

export async function emitOperationalEvent(input: OperationalEventInput) {
  const event = buildOperationalEvent(input);
  await getOperationalEventSink()(event);
  return event;
}

export function setOperationalEventSinkForTesting(sink: OperationalEventSink) {
  operationalEventSinkOverride = sink;
}

export function resetOperationalEventSinkForTesting() {
  operationalEventSinkOverride = null;
  configuredOperationalEventSink = null;
}
