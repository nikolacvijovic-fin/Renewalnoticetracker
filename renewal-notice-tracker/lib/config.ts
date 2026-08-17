import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalNonEmptyString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional()
);
const optionalEmail = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().email().optional()
);
const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().url().optional()
);
const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(emptyStringToUndefined, z.enum(values).optional());
const operationalInt = (input: { min: number; max: number; fallback: number }) =>
  z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(input.min).max(input.max).default(input.fallback)
  );

const productionEnvironmentValues = new Set(["production", "prod"]);
const unsafeSecretPattern =
  /^(test|dev|demo|local|example|placeholder|changeme|change-me|dummy|mock|fake)(?:[-_].*)?$/i;
const unsafeSecretValuePattern =
  /(?:test|dev|demo|local|example|placeholder|changeme|change-me|dummy|mock|fake|localhost)/i;
const unsafeProductionHostPattern = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i;

function isProductionConfigSource(source: {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  APP_ENV?: string;
  NOTICECONTROL_ENV?: string;
  RELEASE_TARGET_ENV?: string;
}) {
  return [
    source.NODE_ENV,
    source.VERCEL_ENV,
    source.APP_ENV,
    source.NOTICECONTROL_ENV,
    source.RELEASE_TARGET_ENV
  ].some((value) => productionEnvironmentValues.has(String(value ?? "").trim().toLowerCase()));
}

function addSafeProductionIssue(
  context: z.RefinementCtx,
  path: string,
  message: string
) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [path],
    message
  });
}

function validateProductionUrl(
  context: z.RefinementCtx,
  key: string,
  value: string,
  input: { requireHttps?: boolean } = {}
) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    addSafeProductionIssue(context, key, `${key} must be a valid production URL.`);
    return;
  }

  if ((input.requireHttps ?? true) && parsed.protocol !== "https:") {
    addSafeProductionIssue(context, key, `${key} must use https in production.`);
  }

  if (unsafeProductionHostPattern.test(parsed.hostname) || parsed.hostname.endsWith(".local")) {
    addSafeProductionIssue(context, key, `${key} must not point to a local development host in production.`);
  }
}

function validateProductionSecret(
  context: z.RefinementCtx,
  key: string,
  value: string | undefined | null,
  input: { minLength?: number } = {}
) {
  const trimmed = String(value ?? "").trim();
  const minLength = input.minLength ?? 16;

  if (!trimmed) {
    addSafeProductionIssue(context, key, `${key} is required in production.`);
    return;
  }

  if (trimmed.length < minLength || unsafeSecretPattern.test(trimmed) || unsafeSecretValuePattern.test(trimmed)) {
    addSafeProductionIssue(context, key, `${key} must be a non-placeholder production secret.`);
  }
}

const rawEnvBaseSchema = z.object({
  NODE_ENV: optionalEnum(["development", "test", "production"]),
  VERCEL_ENV: optionalEnum(["development", "preview", "production"]),
  APP_ENV: optionalNonEmptyString,
  NOTICECONTROL_ENV: optionalNonEmptyString,
  RELEASE_TARGET_ENV: optionalNonEmptyString,
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmptyString,
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyString,
  SUPABASE_STORAGE_BUCKET: nonEmptyString.default("contract-files"),
  SUPABASE_EXPORTS_BUCKET: nonEmptyString,
  OPENAI_API_KEY: nonEmptyString,
  OPENAI_MODEL: nonEmptyString.default("gpt-4.1-mini"),
  OCR_PROVIDER: optionalEnum(["openai", "mock"]),
  OCR_OPENAI_API_KEY: optionalNonEmptyString,
  OCR_OPENAI_MODEL: optionalNonEmptyString,
  RESEND_API_KEY: nonEmptyString,
  RESEND_FROM_EMAIL: z.string().email(),
  RESEND_WEBHOOK_SIGNING_SECRET: optionalNonEmptyString,
  NOTICECONTROL_REPLY_TO_EMAIL: optionalEmail,
  NOTICECONTROL_SENDING_DOMAIN: optionalNonEmptyString,
  NOTICECONTROL_EMAIL_ACTION_SECRET: optionalNonEmptyString,
  CRON_SHARED_SECRET: nonEmptyString,
  PADDLE_API_KEY: optionalNonEmptyString,
  PADDLE_WEBHOOK_SECRET: optionalNonEmptyString,
  PADDLE_ENVIRONMENT: z.preprocess(
    emptyStringToUndefined,
    z.enum(["sandbox", "production"]).default("sandbox")
  ),
  PADDLE_STARTER_PRICE_ID: optionalNonEmptyString,
  PADDLE_GROWTH_PRICE_ID: optionalNonEmptyString,
  INTERNAL_HEALTH_SECRET: nonEmptyString,
  INTERNAL_OCR_JOBS_SECRET: nonEmptyString,
  INTERNAL_OPERATIONS_SECRET: nonEmptyString,
  INTERNAL_DESTRUCTIVE_OPS_SECRET: nonEmptyString,
  INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET: nonEmptyString,
  INTERNAL_OPERATOR_ALLOWLIST: z.string().optional(),
  MONITORING_EVENT_SINK: z.preprocess(
    emptyStringToUndefined,
    z.enum(["structured_log", "structured_log_and_webhook"]).default("structured_log")
  ),
  MONITORING_ALERT_WEBHOOK_URL: optionalUrl,
  MONITORING_ALERT_WEBHOOK_SIGNING_SECRET: optionalNonEmptyString,
  MONITORING_ALERT_WEBHOOK_TIMEOUT_MS: operationalInt({
    min: 250,
    max: 10000,
    fallback: 2500
  }),
  MONITORING_ALERT_WEBHOOK_DELIVERY_MODE: z.preprocess(
    emptyStringToUndefined,
    z.enum(["await", "fire_and_forget"]).default("await")
  ),
  ADD_ON_INTERNAL_SIGNING_SECRET: optionalNonEmptyString,
  PYTHON_INTELLIGENCE_URL: optionalUrl,
  GO_WORKER_URL: optionalUrl,
  JAVA_ENTERPRISE_CONNECTORS_URL: optionalUrl,
  MICROSOFT_365_CLIENT_ID: optionalNonEmptyString,
  MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI: optionalUrl,
  GOOGLE_WORKSPACE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_WORKSPACE_CLIENT_SECRET: optionalNonEmptyString,
  GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI: optionalUrl,
  GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY: optionalNonEmptyString,
  BACKGROUND_EXPORT_PAGE_SIZE: operationalInt({ min: 100, max: 5000, fallback: 1000 }),
  BACKGROUND_EXPORT_JOB_LIMIT: operationalInt({ min: 1, max: 10, fallback: 3 }),
  REMINDER_PROCESSING_LEASE_MINUTES: operationalInt({ min: 1, max: 120, fallback: 15 }),
  OCR_PROCESSING_LEASE_MINUTES: operationalInt({ min: 1, max: 120, fallback: 30 })
});

const rawEnvSchema = rawEnvBaseSchema.superRefine((value, context) => {
  if (
    value.MONITORING_EVENT_SINK === "structured_log_and_webhook" &&
    !value.MONITORING_ALERT_WEBHOOK_URL
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MONITORING_ALERT_WEBHOOK_URL"],
      message: "MONITORING_ALERT_WEBHOOK_URL is required when MONITORING_EVENT_SINK is structured_log_and_webhook."
    });
  }

  if (
    (value.PYTHON_INTELLIGENCE_URL || value.GO_WORKER_URL || value.JAVA_ENTERPRISE_CONNECTORS_URL) &&
    !value.ADD_ON_INTERNAL_SIGNING_SECRET
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ADD_ON_INTERNAL_SIGNING_SECRET"],
      message: "ADD_ON_INTERNAL_SIGNING_SECRET is required when any add-on service URL is configured."
    });
  }

  if (value.MICROSOFT_365_CLIENT_ID && !value.MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI"],
      message: "MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI is required when MICROSOFT_365_CLIENT_ID is configured."
    });
  }

  const googleWorkspaceConfigured = Boolean(
    value.GOOGLE_WORKSPACE_CLIENT_ID ||
    value.GOOGLE_WORKSPACE_CLIENT_SECRET ||
    value.GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI ||
    value.GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY
  );
  if (googleWorkspaceConfigured) {
    for (const [key, configured] of [
      ["GOOGLE_WORKSPACE_CLIENT_ID", value.GOOGLE_WORKSPACE_CLIENT_ID],
      ["GOOGLE_WORKSPACE_CLIENT_SECRET", value.GOOGLE_WORKSPACE_CLIENT_SECRET],
      ["GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI", value.GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI],
      ["GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY", value.GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY]
    ] as const) {
      if (!configured) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when Google Workspace synchronization is configured.`
        });
      }
    }
    if (!value.ADD_ON_INTERNAL_SIGNING_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADD_ON_INTERNAL_SIGNING_SECRET"],
        message: "ADD_ON_INTERNAL_SIGNING_SECRET is required when Google Workspace synchronization is configured."
      });
    }
    if (value.GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY && value.GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY.length < 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY"],
        message: "GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters."
      });
    }
  }

  if (!isProductionConfigSource(value)) {
    return;
  }

  validateProductionUrl(context, "NEXT_PUBLIC_APP_URL", value.NEXT_PUBLIC_APP_URL);
  validateProductionUrl(context, "NEXT_PUBLIC_SUPABASE_URL", value.NEXT_PUBLIC_SUPABASE_URL);
  validateProductionSecret(context, "NEXT_PUBLIC_SUPABASE_ANON_KEY", value.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  validateProductionSecret(context, "SUPABASE_SERVICE_ROLE_KEY", value.SUPABASE_SERVICE_ROLE_KEY);
  validateProductionSecret(context, "OPENAI_API_KEY", value.OPENAI_API_KEY);
  validateProductionSecret(context, "RESEND_API_KEY", value.RESEND_API_KEY);
  validateProductionSecret(context, "CRON_SHARED_SECRET", value.CRON_SHARED_SECRET);
  validateProductionSecret(context, "INTERNAL_HEALTH_SECRET", value.INTERNAL_HEALTH_SECRET);
  validateProductionSecret(context, "INTERNAL_OCR_JOBS_SECRET", value.INTERNAL_OCR_JOBS_SECRET);
  validateProductionSecret(context, "INTERNAL_OPERATIONS_SECRET", value.INTERNAL_OPERATIONS_SECRET);
  validateProductionSecret(context, "INTERNAL_DESTRUCTIVE_OPS_SECRET", value.INTERNAL_DESTRUCTIVE_OPS_SECRET);
  validateProductionSecret(
    context,
    "INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET",
    value.INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET
  );

  if (value.SUPABASE_EXPORTS_BUCKET === "export-artifacts" || value.SUPABASE_STORAGE_BUCKET === "contract-files") {
    addSafeProductionIssue(
      context,
      "SUPABASE_EXPORTS_BUCKET",
      "Production storage buckets must be explicitly reviewed and not rely on local placeholder defaults."
    );
  }

  if (!value.RESEND_WEBHOOK_SIGNING_SECRET) {
    addSafeProductionIssue(
      context,
      "RESEND_WEBHOOK_SIGNING_SECRET",
      "RESEND_WEBHOOK_SIGNING_SECRET is required in production."
    );
  }

  validateProductionSecret(context, "RESEND_WEBHOOK_SIGNING_SECRET", value.RESEND_WEBHOOK_SIGNING_SECRET);

  if (!value.NOTICECONTROL_EMAIL_ACTION_SECRET) {
    addSafeProductionIssue(
      context,
      "NOTICECONTROL_EMAIL_ACTION_SECRET",
      "NOTICECONTROL_EMAIL_ACTION_SECRET is required in production."
    );
  }

  validateProductionSecret(context, "NOTICECONTROL_EMAIL_ACTION_SECRET", value.NOTICECONTROL_EMAIL_ACTION_SECRET);

  if (value.OCR_PROVIDER === "openai") {
    validateProductionSecret(context, "OCR_OPENAI_API_KEY", value.OCR_OPENAI_API_KEY);
    if (!value.OCR_OPENAI_MODEL) {
      addSafeProductionIssue(context, "OCR_OPENAI_MODEL", "OCR_OPENAI_MODEL is required when OCR_PROVIDER is openai in production.");
    }
  }

  if (value.PADDLE_ENVIRONMENT !== "production") {
    addSafeProductionIssue(
      context,
      "PADDLE_ENVIRONMENT",
      "PADDLE_ENVIRONMENT must be production for production deployments."
    );
  }

  validateProductionSecret(context, "PADDLE_API_KEY", value.PADDLE_API_KEY);
  validateProductionSecret(context, "PADDLE_WEBHOOK_SECRET", value.PADDLE_WEBHOOK_SECRET);
  validateProductionSecret(context, "PADDLE_STARTER_PRICE_ID", value.PADDLE_STARTER_PRICE_ID, {
    minLength: 8
  });
  validateProductionSecret(context, "PADDLE_GROWTH_PRICE_ID", value.PADDLE_GROWTH_PRICE_ID, {
    minLength: 8
  });

  if (value.MONITORING_EVENT_SINK === "structured_log_and_webhook") {
    validateProductionUrl(context, "MONITORING_ALERT_WEBHOOK_URL", value.MONITORING_ALERT_WEBHOOK_URL ?? "");
    validateProductionSecret(
      context,
      "MONITORING_ALERT_WEBHOOK_SIGNING_SECRET",
      value.MONITORING_ALERT_WEBHOOK_SIGNING_SECRET
    );
  }
});

export type RawConfig = z.infer<typeof rawEnvSchema>;

export type AppConfig = {
  public: {
    appUrl: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    storageBucket: string;
    exportStorageBucket: string;
  };
  ai: {
    openaiApiKey: string;
    openaiModel: string;
  };
  ocr: {
    provider: "openai" | "mock" | null;
    openaiApiKey: string | null;
    openaiModel: string | null;
  };
  email: {
    resendApiKey: string;
    fromEmail: string;
    webhookSigningSecret: string | null;
    replyToEmail: string | null;
    sendingDomain: string | null;
    actionSecret: string | null;
  };
  internal: {
    cronSharedSecret: string;
    healthSecret: string;
    ocrJobsSecret: string;
    operationsSecret: string;
    destructiveOpsSecret: string;
    destructiveOpsSigningSecret: string;
    operatorAllowlist: string | null;
  };
  billing: {
    paddleApiKey: string | null;
    paddleWebhookSecret: string | null;
    paddleEnvironment: "sandbox" | "production";
    paddleStarterPriceId: string | null;
    paddleGrowthPriceId: string | null;
  };
  operations: {
    monitoringEventSink: "structured_log" | "structured_log_and_webhook";
    monitoringAlertWebhookUrl: string | null;
    monitoringAlertWebhookSigningSecret: string | null;
    monitoringAlertWebhookTimeoutMs: number;
    monitoringAlertWebhookDeliveryMode: "await" | "fire_and_forget";
    backgroundExportPageSize: number;
    backgroundExportJobLimit: number;
    reminderProcessingLeaseMinutes: number;
    ocrProcessingLeaseMinutes: number;
  };
  addOns: {
    internalSigningSecret: string | null;
    pythonIntelligenceUrl: string | null;
    goWorkerUrl: string | null;
    javaEnterpriseConnectorsUrl: string | null;
  };
  microsoft365: {
    clientId: string | null;
    adminConsentRedirectUri: string | null;
  };
  googleWorkspace: {
    clientId: string | null;
    clientSecret: string | null;
    oauthRedirectUri: string | null;
    credentialEncryptionKey: string | null;
  };
  raw: RawConfig;
};

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid NoticeControl configuration: ${issues.join("; ")}`);
    this.name = "ConfigValidationError";
  }
}

function nullable(value: string | undefined) {
  return value ?? null;
}

function formatConfigIssues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "environment";
    return `${path}: ${issue.message}`;
  });
}

export function parseAppConfig(
  source: Record<string, string | undefined> = process.env
): AppConfig {
  const parsed = rawEnvSchema.safeParse(source);

  if (!parsed.success) {
    throw new ConfigValidationError(formatConfigIssues(parsed.error));
  }

  const raw = parsed.data;

  return {
    public: {
      appUrl: raw.NEXT_PUBLIC_APP_URL,
      supabaseUrl: raw.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: raw.NEXT_PUBLIC_SUPABASE_ANON_KEY
    },
    supabase: {
      url: raw.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: raw.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
      storageBucket: raw.SUPABASE_STORAGE_BUCKET,
      exportStorageBucket: raw.SUPABASE_EXPORTS_BUCKET
    },
    ai: {
      openaiApiKey: raw.OPENAI_API_KEY,
      openaiModel: raw.OPENAI_MODEL
    },
    ocr: {
      provider: (raw.OCR_PROVIDER ?? null) as AppConfig["ocr"]["provider"],
      openaiApiKey: nullable(raw.OCR_OPENAI_API_KEY),
      openaiModel: nullable(raw.OCR_OPENAI_MODEL)
    },
    email: {
      resendApiKey: raw.RESEND_API_KEY,
      fromEmail: raw.RESEND_FROM_EMAIL,
      webhookSigningSecret: nullable(raw.RESEND_WEBHOOK_SIGNING_SECRET),
      replyToEmail: nullable(raw.NOTICECONTROL_REPLY_TO_EMAIL),
      sendingDomain: nullable(raw.NOTICECONTROL_SENDING_DOMAIN),
      actionSecret: nullable(raw.NOTICECONTROL_EMAIL_ACTION_SECRET)
    },
    internal: {
      cronSharedSecret: raw.CRON_SHARED_SECRET,
      healthSecret: raw.INTERNAL_HEALTH_SECRET,
      ocrJobsSecret: raw.INTERNAL_OCR_JOBS_SECRET,
      operationsSecret: raw.INTERNAL_OPERATIONS_SECRET,
      destructiveOpsSecret: raw.INTERNAL_DESTRUCTIVE_OPS_SECRET,
      destructiveOpsSigningSecret: raw.INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET,
      operatorAllowlist: nullable(raw.INTERNAL_OPERATOR_ALLOWLIST)
    },
    billing: {
      paddleApiKey: nullable(raw.PADDLE_API_KEY),
      paddleWebhookSecret: nullable(raw.PADDLE_WEBHOOK_SECRET),
      paddleEnvironment: raw.PADDLE_ENVIRONMENT,
      paddleStarterPriceId: nullable(raw.PADDLE_STARTER_PRICE_ID),
      paddleGrowthPriceId: nullable(raw.PADDLE_GROWTH_PRICE_ID)
    },
    operations: {
      monitoringEventSink: raw.MONITORING_EVENT_SINK,
      monitoringAlertWebhookUrl: nullable(raw.MONITORING_ALERT_WEBHOOK_URL),
      monitoringAlertWebhookSigningSecret: nullable(raw.MONITORING_ALERT_WEBHOOK_SIGNING_SECRET),
      monitoringAlertWebhookTimeoutMs: raw.MONITORING_ALERT_WEBHOOK_TIMEOUT_MS,
      monitoringAlertWebhookDeliveryMode: raw.MONITORING_ALERT_WEBHOOK_DELIVERY_MODE,
      backgroundExportPageSize: raw.BACKGROUND_EXPORT_PAGE_SIZE,
      backgroundExportJobLimit: raw.BACKGROUND_EXPORT_JOB_LIMIT,
      reminderProcessingLeaseMinutes: raw.REMINDER_PROCESSING_LEASE_MINUTES,
      ocrProcessingLeaseMinutes: raw.OCR_PROCESSING_LEASE_MINUTES
    },
    addOns: {
      internalSigningSecret: nullable(raw.ADD_ON_INTERNAL_SIGNING_SECRET),
      pythonIntelligenceUrl: nullable(raw.PYTHON_INTELLIGENCE_URL),
      goWorkerUrl: nullable(raw.GO_WORKER_URL),
      javaEnterpriseConnectorsUrl: nullable(raw.JAVA_ENTERPRISE_CONNECTORS_URL)
    },
    microsoft365: {
      clientId: nullable(raw.MICROSOFT_365_CLIENT_ID),
      adminConsentRedirectUri: nullable(raw.MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI)
    },
    googleWorkspace: {
      clientId: nullable(raw.GOOGLE_WORKSPACE_CLIENT_ID),
      clientSecret: nullable(raw.GOOGLE_WORKSPACE_CLIENT_SECRET),
      oauthRedirectUri: nullable(raw.GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI),
      credentialEncryptionKey: nullable(raw.GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY)
    },
    raw
  };
}

const publicEnvSchema = rawEnvBaseSchema.pick({
  NEXT_PUBLIC_APP_URL: true,
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true
});

export function parsePublicConfig(
  source: Record<string, string | undefined> = process.env
) {
  const parsed = publicEnvSchema.safeParse(source);

  if (!parsed.success) {
    throw new ConfigValidationError(formatConfigIssues(parsed.error));
  }

  return {
    appUrl: parsed.data.NEXT_PUBLIC_APP_URL,
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

let cachedConfig: AppConfig | null = null;
let cachedPublicConfig: ReturnType<typeof parsePublicConfig> | null = null;

export function getAppConfig() {
  cachedConfig ??= parseAppConfig();
  return cachedConfig;
}

export function getPublicConfig() {
  cachedPublicConfig ??= parsePublicConfig();
  return cachedPublicConfig;
}
