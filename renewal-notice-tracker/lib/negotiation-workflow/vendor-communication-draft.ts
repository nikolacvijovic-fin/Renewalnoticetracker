import type { NegotiationBrief } from "@/lib/negotiation-workflow/negotiation-types";
import type {
  VendorCommunicationChannel,
  VendorCommunicationDraftResult,
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

export function buildVendorCommunicationDraft(input: {
  brief: NegotiationBrief;
  channel?: VendorCommunicationChannel;
  tone?: VendorCommunicationTone;
}): VendorCommunicationDraftResult {
  const channel = input.channel ?? "email";
  const tone = input.tone ?? "neutral";
  const subject = channel === "email" ? `Draft only: renewal commercial review` : null;
  const missingEvidence = input.brief.blocker_codes.length > 0;
  const body = [
    "[INTERNAL DRAFT ONLY - DO NOT SEND AUTOMATICALLY]",
    `${channelLabel(channel)} tone: ${tone}.`,
    greeting(tone),
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
