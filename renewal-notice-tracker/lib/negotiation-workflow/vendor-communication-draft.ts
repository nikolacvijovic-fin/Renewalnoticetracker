import type { NegotiationBrief } from "@/lib/negotiation-workflow/negotiation-types";
import type {
  VendorCommunicationChannel,
  VendorCommunicationDraftResult,
  VendorCommunicationDraftType,
  VendorCommunicationTone
} from "@/lib/negotiation-workflow/negotiation-types";

const SENSITIVE_PATTERNS = [
  /raw\s+(contract|quote|ocr|document|payload)/i,
  /ocr output/i,
  /provider payload/i,
  /storage path/i,
  /\b(secret|token|bearer|password|api[_ -]?key)\b/i
];

function clean(value: string, maxLength = 900) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "[redacted: sensitive source content removed]";
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function greeting(tone: VendorCommunicationTone) {
  if (tone === "executive") return "We are reviewing renewal economics and need a concise commercial response.";
  if (tone === "firm") return "We are not ready to accept the current renewal position as proposed.";
  if (tone === "collaborative") return "We are reviewing the renewal and would like to align on a workable commercial path.";
  return "We are reviewing the renewal terms and need clarification before moving forward.";
}

function channelLabel(channel: VendorCommunicationChannel) {
  if (channel === "call_script") return "Call script";
  if (channel === "internal_note") return "Internal note";
  return "Email";
}

function draftIntent(type: VendorCommunicationDraftType) {
  switch (type) {
    case "request_seat_reduction_pricing":
      return { subject: "Request for reduced-seat renewal pricing", ask: "Please provide a revised proposal for the customer-confirmed seat requirement." };
    case "challenge_price_increase":
      return { subject: "Renewal price review", ask: "Please explain the proposed price change and provide revised commercial terms for review." };
    case "request_revised_payment_terms":
      return { subject: "Request for revised renewal payment terms", ask: "Please provide alternative payment terms for customer review." };
    case "notice_of_nonrenewal":
      return { subject: "Draft notice of non-renewal", ask: "The customer is considering non-renewal. Confirm the contractual notice method and dates before any manual delivery." };
    case "request_additional_time":
      return { subject: "Request for additional renewal review time", ask: "Please confirm whether additional review time is available without changing the customer's contractual position." };
    default:
      return { subject: "Request for renewal proposal", ask: "Please provide the proposed renewal pricing, quantities, term, and payment terms for review." };
  }
}

export function buildVendorCommunicationDraft(input: {
  brief: NegotiationBrief;
  draftType?: VendorCommunicationDraftType;
  channel?: VendorCommunicationChannel;
  tone?: VendorCommunicationTone;
}): VendorCommunicationDraftResult {
  const channel = input.channel ?? "email";
  const tone = input.tone ?? "neutral";
  const draftType = input.draftType ?? "request_renewal_quote";
  const intent = draftIntent(draftType);
  const subject = channel === "email" ? `Draft only: ${intent.subject}` : null;
  const missingEvidence = input.brief.blocker_codes.length > 0;
  const body = [
    "[INTERNAL DRAFT ONLY - DO NOT SEND AUTOMATICALLY]",
    `${channelLabel(channel)} tone: ${tone}.`,
    greeting(tone),
    `Requested action: ${intent.ask}`,
    `Issue: ${clean(input.brief.commercial_risk_summary)}`,
    `Ask: ${clean(input.brief.target_ask)}`,
    `Rationale: ${clean(input.brief.savings_argument ?? "Use only the approved evidence summary and confirm missing evidence before external use.")}`,
    `Deadline reference: ${clean(input.brief.deadline_risk ?? "Deadline evidence is missing; confirm before use.")}`,
    `Fallback: ${clean(input.brief.fallback_position)}`,
    missingEvidence
      ? `Evidence gap: ${input.brief.blocker_codes.join(", ")}. Replace placeholders before approval.`
      : "Evidence status: approved evidence summary is available for manual review.",
    "Next step: route this draft for internal approval. Approved for copy means manual copy only; this system does not send vendor messages."
  ].join("\n\n");

  return {
    draftType,
    channel,
    tone,
    subject,
    draftBody: clean(body, 4000),
    internalReviewerNote:
      "Draft-only vendor communication. Verify evidence, deadlines, and approval status before manual copy.",
    evidenceTrace: {
      briefId: input.brief.id,
      strategy: input.brief.strategy,
      confidenceScore: input.brief.confidence_score,
      blockerCodes: input.brief.blocker_codes,
      warningCodes: input.brief.warning_codes,
      draftOnly: true,
      automaticSending: false
    }
  };
}
