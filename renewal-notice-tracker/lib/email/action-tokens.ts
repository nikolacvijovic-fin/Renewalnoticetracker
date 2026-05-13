import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const PHASE1_EMAIL_ACTIONS = ["acknowledge", "decision"] as const;
export type Phase1EmailAction = (typeof PHASE1_EMAIL_ACTIONS)[number];

export const PHASE1_EMAIL_ACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ReminderEmailActionTokenPayload = {
  organizationId: string;
  recipientIdentity: string;
  contractId: string;
  reminderId: string;
  action: Phase1EmailAction;
  expiresAt: string;
  userId?: string | null;
};

export class ReminderEmailActionTokenError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid"
      | "expired"
      | "wrong_action"
  ) {
    super(message);
    this.name = "ReminderEmailActionTokenError";
  }
}

function getSigningSecret() {
  return env.NOTICECONTROL_EMAIL_ACTION_SECRET?.trim() || env.CRON_SHARED_SECRET;
}

function encodeBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");
}

function assertExpectedAction(action: string): asserts action is Phase1EmailAction {
  if (!(PHASE1_EMAIL_ACTIONS as readonly string[]).includes(action)) {
    throw new ReminderEmailActionTokenError("Invalid email action.", "invalid");
  }
}

export function createReminderEmailActionToken(
  input: Omit<ReminderEmailActionTokenPayload, "expiresAt"> & {
    expiresAt?: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const expiresAt =
    input.expiresAt ?? new Date(now.getTime() + PHASE1_EMAIL_ACTION_TTL_MS).toISOString();

  const payload: ReminderEmailActionTokenPayload = {
    organizationId: input.organizationId,
    recipientIdentity: input.recipientIdentity.trim().toLowerCase(),
    contractId: input.contractId,
    reminderId: input.reminderId,
    action: input.action,
    expiresAt,
    userId: input.userId ?? null
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function validateReminderEmailActionToken(
  token: string,
  expectedAction?: Phase1EmailAction,
  now = new Date()
) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new ReminderEmailActionTokenError("Invalid email action link.", "invalid");
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new ReminderEmailActionTokenError("Invalid email action link.", "invalid");
  }

  let payload: ReminderEmailActionTokenPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as ReminderEmailActionTokenPayload;
  } catch {
    throw new ReminderEmailActionTokenError("Invalid email action link.", "invalid");
  }

  assertExpectedAction(payload.action);
  if (expectedAction && payload.action !== expectedAction) {
    throw new ReminderEmailActionTokenError("Email action does not match the requested workflow.", "wrong_action");
  }

  const expiresAtMs = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
    throw new ReminderEmailActionTokenError("Email action link has expired.", "expired");
  }

  return {
    ...payload,
    recipientIdentity: payload.recipientIdentity.trim().toLowerCase()
  };
}
