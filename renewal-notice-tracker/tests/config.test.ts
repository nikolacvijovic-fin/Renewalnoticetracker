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
    ADD_ON_INTERNAL_SIGNING_SECRET: "",
    PYTHON_INTELLIGENCE_URL: "",
    GO_WORKER_URL: "",
    JAVA_ENTERPRISE_CONNECTORS_URL: "",
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
    expect(config.addOns).toEqual({
      internalSigningSecret: null,
      pythonIntelligenceUrl: null,
      goWorkerUrl: null,
      javaEnterpriseConnectorsUrl: null
    });
  });

  it("loads optional add-on service URLs when configured", () => {
    const config = parseAppConfig(
      makeValidEnv({
        PYTHON_INTELLIGENCE_URL: "https://python.example.com",
        GO_WORKER_URL: "https://worker.example.com",
        JAVA_ENTERPRISE_CONNECTORS_URL: "https://java.example.com",
        ADD_ON_INTERNAL_SIGNING_SECRET: "test-add-on-secret"
      })
    );

    expect(config.addOns).toEqual({
      internalSigningSecret: "test-add-on-secret",
      pythonIntelligenceUrl: "https://python.example.com",
      goWorkerUrl: "https://worker.example.com",
      javaEnterpriseConnectorsUrl: "https://java.example.com"
    });
  });

  it("rejects malformed add-on service URLs", () => {
    expect(() =>
      parseAppConfig(
        makeValidEnv({
          PYTHON_INTELLIGENCE_URL: "not-a-url"
        })
      )
    ).toThrow(/PYTHON_INTELLIGENCE_URL/i);
  });

  it("requires an internal signing secret when add-on URLs are configured", () => {
    expect(() =>
      parseAppConfig(
        makeValidEnv({
          PYTHON_INTELLIGENCE_URL: "https://python.example.com"
        })
      )
    ).toThrow(/ADD_ON_INTERNAL_SIGNING_SECRET/i);
  });

  it("loads a complete optional Google Workspace connector configuration", () => {
    const config = parseAppConfig(
      makeValidEnv({
        ADD_ON_INTERNAL_SIGNING_SECRET: "test-add-on-signing-secret",
        GOOGLE_WORKSPACE_CLIENT_ID: "google-client-id",
        GOOGLE_WORKSPACE_CLIENT_SECRET: "google-client-secret",
        GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI: "https://app.example.test/api/subscription-usage/google-workspace/callback",
        GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY: "test-credential-encryption-key-32chars"
      })
    );

    expect(config.googleWorkspace).toEqual({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      oauthRedirectUri: "https://app.example.test/api/subscription-usage/google-workspace/callback",
      credentialEncryptionKey: "test-credential-encryption-key-32chars"
    });
  });

  it("rejects partial Google Workspace connector configuration", () => {
    expect(() =>
      parseAppConfig(
        makeValidEnv({
          GOOGLE_WORKSPACE_CLIENT_ID: "google-client-id"
        })
      )
    ).toThrow(/GOOGLE_WORKSPACE_CLIENT_SECRET/i);
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

  it("uses the safe default alert webhook timeout when the env var is omitted", () => {
    const config = parseAppConfig(
      makeValidEnv({
        MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: undefined
      })
    );

    expect(config.operations.monitoringAlertWebhookTimeoutMs).toBe(2500);
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

  it("rejects placeholder and local production configuration without printing secret values", () => {
    const env = makeValidEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      PADDLE_ENVIRONMENT: "sandbox"
    });

    expect(() => parseAppConfig(env)).toThrow(ConfigValidationError);

    try {
      parseAppConfig(env);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const rendered = String((error as ConfigValidationError).message);
      expect(rendered).toContain("NEXT_PUBLIC_APP_URL");
      expect(rendered).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(rendered).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(rendered).toContain("PADDLE_ENVIRONMENT");
      expect(rendered).not.toContain("test-service-key");
      expect(rendered).not.toContain("test-paddle-key");
    }
  });

  it("accepts explicitly production-safe config values", () => {
    const config = parseAppConfig(
      makeValidEnv({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.noticecontrol.example",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "pk_live_noticecontrol_anon_123456789",
        SUPABASE_SERVICE_ROLE_KEY: "sk_live_noticecontrol_service_123456789",
        SUPABASE_STORAGE_BUCKET: "noticecontrol-prod-contract-files",
        SUPABASE_EXPORTS_BUCKET: "noticecontrol-prod-export-artifacts",
        OPENAI_API_KEY: "sk_live_noticecontrol_openai_123456789",
        OCR_PROVIDER: "openai",
        OCR_OPENAI_API_KEY: "sk_live_noticecontrol_ocr_123456789",
        OCR_OPENAI_MODEL: "gpt-4.1-mini",
        RESEND_API_KEY: "re_live_noticecontrol_123456789",
        RESEND_WEBHOOK_SIGNING_SECRET: "resend_live_webhook_secret_123456789",
        NOTICECONTROL_EMAIL_ACTION_SECRET: "email_action_live_secret_123456789",
        CRON_SHARED_SECRET: "cron_live_secret_123456789",
        PADDLE_ENVIRONMENT: "production",
        PADDLE_API_KEY: "paddle_live_api_key_123456789",
        PADDLE_WEBHOOK_SECRET: "paddle_live_webhook_secret_123456789",
        PADDLE_STARTER_PRICE_ID: "pri_live_starter_123456789",
        PADDLE_GROWTH_PRICE_ID: "pri_live_growth_123456789",
        INTERNAL_HEALTH_SECRET: "health_live_secret_123456789",
        INTERNAL_OCR_JOBS_SECRET: "ocr_jobs_live_secret_123456789",
        INTERNAL_OPERATIONS_SECRET: "operations_live_secret_123456789",
        INTERNAL_DESTRUCTIVE_OPS_SECRET: "destructive_live_secret_123456789",
        INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET: "destructive_signing_live_secret_123456789",
        MONITORING_EVENT_SINK: "structured_log_and_webhook",
        MONITORING_ALERT_WEBHOOK_URL: "https://alerts.noticecontrol.example/events",
        MONITORING_ALERT_WEBHOOK_SIGNING_SECRET: "monitoring_live_signing_secret_123456789"
      })
    );

    expect(config.public.appUrl).toBe("https://app.noticecontrol.example");
    expect(config.billing.paddleEnvironment).toBe("production");
    expect(config.operations.monitoringEventSink).toBe("structured_log_and_webhook");
  });
});
