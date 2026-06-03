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
const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(emptyStringToUndefined, z.enum(values).optional());

const rawEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmptyString,
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyString,
  SUPABASE_STORAGE_BUCKET: nonEmptyString.default("contract-files"),
  SUPABASE_EXPORTS_BUCKET: nonEmptyString.default("export-artifacts"),
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
  INTERNAL_OPERATOR_ALLOWLIST: z.string().optional()
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
    raw
  };
}

const publicEnvSchema = rawEnvSchema.pick({
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
