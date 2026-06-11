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
export type AlertWebhookDeliveryMode = "await" | "fire_and_forget";

export type AlertWebhookDeliveryConfig = {
  url: string | null;
  signingSecret: string | null;
  timeoutMs: number;
  deliveryMode: AlertWebhookDeliveryMode;
};

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

function getAlertWebhookDeliveryConfig(): AlertWebhookDeliveryConfig {
  const config = getAppConfig().operations;

  return {
    url: config.monitoringAlertWebhookUrl,
    signingSecret: config.monitoringAlertWebhookSigningSecret,
    timeoutMs: config.monitoringAlertWebhookTimeoutMs,
    deliveryMode: config.monitoringAlertWebhookDeliveryMode
  };
}

function isTimeoutError(error: unknown, signal: AbortSignal) {
  if (signal.aborted) return true;

  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
  );
}

function logAlertWebhookUnexpectedError(event: OperationalEvent, error: unknown) {
  logServerError({
    event: "monitoring.alert_webhook_unexpected_error",
    metadata: {
      monitoring_event: event.eventName,
      severity: event.severity
    },
    error
  });
}

export async function deliverAlertWebhookEvent(
  event: OperationalEvent,
  config: AlertWebhookDeliveryConfig
) {
  if (!config.url) {
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

  if (config.signingSecret) {
    headers["x-noticecontrol-signature-sha256"] = signAlertWebhookPayload(
      body,
      config.signingSecret
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });

    if (!response.ok) {
      logServerWarn({
        event: "monitoring.alert_webhook_delivery_failed",
        metadata: {
          monitoring_event: event.eventName,
          severity: event.severity,
          status: response.status,
          timeout_ms: config.timeoutMs
        }
      });
    }
  } catch (error) {
    if (isTimeoutError(error, controller.signal)) {
      logServerWarn({
        event: "monitoring.alert_webhook_delivery_timeout",
        metadata: {
          monitoring_event: event.eventName,
          severity: event.severity,
          timeout_ms: config.timeoutMs
        },
        error
      });
      return;
    }

    logServerError({
      event: "monitoring.alert_webhook_delivery_error",
      metadata: {
        monitoring_event: event.eventName,
        severity: event.severity,
        timeout_ms: config.timeoutMs
      },
      error
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function alertWebhookOperationalEventSink(
  event: OperationalEvent,
  config: AlertWebhookDeliveryConfig = getAlertWebhookDeliveryConfig()
) {
  if (!event.alert) return;

  if (config.deliveryMode === "fire_and_forget") {
    void deliverAlertWebhookEvent(event, config).catch((error) =>
      logAlertWebhookUnexpectedError(event, error)
    );
    return;
  }

  try {
    await deliverAlertWebhookEvent(event, config);
  } catch (error) {
    logAlertWebhookUnexpectedError(event, error);
  }
}

export async function structuredLogAndWebhookOperationalEventSink(
  event: OperationalEvent,
  config?: AlertWebhookDeliveryConfig
) {
  structuredLogOperationalEventSink(event);
  await alertWebhookOperationalEventSink(event, config);
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
