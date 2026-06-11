import { describe, expect, it } from "vitest";
import { ConfigValidationError, parseAppConfig } from "@/lib/config";

function makeValidEnv(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    SUPABASE_STORAGE_BUCKET: "contract-files",
    SUPABASE_EXPORTS_BUCKET: "export-artifacts",
    BACKGROUND_EXPORT_PAGE_SIZE: "1000",
    BACKGROUND_EXPORT_JOB_LIMIT: "3",
    MONITORING_EVENT_SINK: "structured_log",
    MONITORING_ALERT_WEBHOOK_URL: "",
    MONITORING_ALERT_WEBHOOK_SIGNING_SECRET: "",
    MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: "2500",
    MONITORING_ALERT_WEBHOOK_DELIVERY_MODE: "await",
    REMINDER_PROCESSING_LEASE_MINUTES: "15",
    OCR_PROCESSING_LEASE_MINUTES: "30",
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL: "gpt-4.1-mini",
    OCR_PROVIDER: "openai",
    RESEND_API_KEY: "test-resend-key",
    RESEND_FROM_EMAIL: "notifications@noticecontrol.com",
    RESEND_WEBHOOK_SIGNING_SECRET: "test-resend-webhook-secret",
    NOTICECONTROL_REPLY_TO_EMAIL: "support@noticecontrol.com",
    NOTICECONTROL_SENDING_DOMAIN: "noticecontrol.com",
    CRON_SHARED_SECRET: "test-cron-secret",
    PADDLE_API_KEY: "test-paddle-key",
    PADDLE_WEBHOOK_SECRET: "test-paddle-secret",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_STARTER_PRICE_ID: "price_starter",
    PADDLE_GROWTH_PRICE_ID: "price_growth",
    INTERNAL_HEALTH_SECRET: "test-health-secret",
    INTERNAL_OCR_JOBS_SECRET: "test-ocr-secret",
    INTERNAL_OPERATIONS_SECRET: "test-operations-secret",
    INTERNAL_DESTRUCTIVE_OPS_SECRET: "test-destructive-secret",
    INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET: "test-destructive-signing-secret",
    INTERNAL_OPERATOR_ALLOWLIST: "support@example.com:internal_support",
    ...overrides
  };
}

describe("runtime configuration", () => {
  it("loads valid config into grouped operational concerns", () => {
    const config = parseAppConfig(makeValidEnv());

    expect(config.public).toEqual({
      appUrl: "http://localhost:3000",
      supabaseUrl: "http://localhost:54321",
      supabaseAnonKey: "test-anon-key"
    });
    expect(config.supabase).toMatchObject({
      serviceRoleKey: "test-service-key",
      storageBucket: "contract-files",
      exportStorageBucket: "export-artifacts"
    });
    expect(config.internal).toMatchObject({
      cronSharedSecret: "test-cron-secret",
      destructiveOpsSigningSecret: "test-destructive-signing-secret"
    });
    expect(config.billing).toMatchObject({
      paddleEnvironment: "sandbox",
      paddleGrowthPriceId: "price_growth"
    });
    expect(config.operations).toMatchObject({
      monitoringEventSink: "structured_log",
      monitoringAlertWebhookUrl: null,
      monitoringAlertWebhookSigningSecret: null,
      monitoringAlertWebhookTimeoutMs: 2500,
      monitoringAlertWebhookDeliveryMode: "await",
      backgroundExportPageSize: 1000,
      backgroundExportJobLimit: 3,
      reminderProcessingLeaseMinutes: 15,
      ocrProcessingLeaseMinutes: 30
    });
  });

  it("fails clearly when required secrets are missing", () => {
    const env = makeValidEnv();
    delete env.INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET;

    expect(() => parseAppConfig(env)).toThrow(ConfigValidationError);
    expect(() => parseAppConfig(env)).toThrow(/INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET/i);
  });

  it("fails clearly when required export storage config is missing", () => {
    const env = makeValidEnv();
    delete env.SUPABASE_EXPORTS_BUCKET;

    expect(() => parseAppConfig(env)).toThrow(ConfigValidationError);
    expect(() => parseAppConfig(env)).toThrow(/SUPABASE_EXPORTS_BUCKET/i);
  });

  it("fails clearly when required URLs are malformed", () => {
    expect(() =>
      parseAppConfig(
        makeValidEnv({
          NEXT_PUBLIC_APP_URL: "not-a-url"
        })
      )
    ).toThrow(/NEXT_PUBLIC_APP_URL.*url/i);
  });

  it("fails clearly when enum-like config is invalid", () => {
    expect(() =>
      parseAppConfig(
        makeValidEnv({
          PADDLE_ENVIRONMENT: "staging"
        })
      )
    ).toThrow(/PADDLE_ENVIRONMENT/i);
  });

  it("fails clearly when operational config is malformed", () => {
    expect(() =>
      parseAppConfig(
        makeValidEnv({
          BACKGROUND_EXPORT_PAGE_SIZE: "not-a-number"
        })
      )
    ).toThrow(/BACKGROUND_EXPORT_PAGE_SIZE/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          MONITORING_EVENT_SINK: "third_party_sink"
        })
      )
    ).toThrow(/MONITORING_EVENT_SINK/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          MONITORING_EVENT_SINK: "structured_log_and_webhook"
        })
      )
    ).toThrow(/MONITORING_ALERT_WEBHOOK_URL/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          MONITORING_ALERT_WEBHOOK_URL: "not-a-url"
        })
      )
    ).toThrow(/MONITORING_ALERT_WEBHOOK_URL/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: "0"
        })
      )
    ).toThrow(/MONITORING_ALERT_WEBHOOK_TIMEOUT_MS/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: "20000"
        })
      )
    ).toThrow(/MONITORING_ALERT_WEBHOOK_TIMEOUT_MS/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          MONITORING_ALERT_WEBHOOK_DELIVERY_MODE: "blocking_forever"
        })
      )
    ).toThrow(/MONITORING_ALERT_WEBHOOK_DELIVERY_MODE/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          REMINDER_PROCESSING_LEASE_MINUTES: "0"
        })
      )
    ).toThrow(/REMINDER_PROCESSING_LEASE_MINUTES/i);

    expect(() =>
      parseAppConfig(
        makeValidEnv({
          OCR_PROCESSING_LEASE_MINUTES: "999"
        })
      )
    ).toThrow(/OCR_PROCESSING_LEASE_MINUTES/i);
  });

  it("treats blank optional config as absent while still requiring critical values", () => {
    const config = parseAppConfig(
      makeValidEnv({
        OCR_OPENAI_API_KEY: "",
        NOTICECONTROL_EMAIL_ACTION_SECRET: "",
        PADDLE_API_KEY: ""
      })
    );

    expect(config.ocr.openaiApiKey).toBeNull();
    expect(config.email.actionSecret).toBeNull();
    expect(config.billing.paddleApiKey).toBeNull();
  });

  it("allows optional external alert webhook config when explicitly selected", () => {
    const config = parseAppConfig(
      makeValidEnv({
        MONITORING_EVENT_SINK: "structured_log_and_webhook",
        MONITORING_ALERT_WEBHOOK_URL: "https://alerts.example.test/noticecontrol",
        MONITORING_ALERT_WEBHOOK_SIGNING_SECRET: "test-alert-signing-secret"
      })
    );

    expect(config.operations).toMatchObject({
      monitoringEventSink: "structured_log_and_webhook",
      monitoringAlertWebhookUrl: "https://alerts.example.test/noticecontrol",
      monitoringAlertWebhookSigningSecret: "test-alert-signing-secret",
      monitoringAlertWebhookTimeoutMs: 2500,
      monitoringAlertWebhookDeliveryMode: "await"
    });
  });

  it("allows explicit fire-and-forget alert webhook fanout mode", () => {
    const config = parseAppConfig(
      makeValidEnv({
        MONITORING_EVENT_SINK: "structured_log_and_webhook",
        MONITORING_ALERT_WEBHOOK_URL: "https://alerts.example.test/noticecontrol",
        MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: "750",
        MONITORING_ALERT_WEBHOOK_DELIVERY_MODE: "fire_and_forget"
      })
    );

    expect(config.operations).toMatchObject({
      monitoringEventSink: "structured_log_and_webhook",
      monitoringAlertWebhookUrl: "https://alerts.example.test/noticecontrol",
      monitoringAlertWebhookTimeoutMs: 750,
      monitoringAlertWebhookDeliveryMode: "fire_and_forget"
    });
  });
});
