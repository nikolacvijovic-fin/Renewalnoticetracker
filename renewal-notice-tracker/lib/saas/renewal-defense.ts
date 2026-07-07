export type NoticePeriodUnit = "days" | "weeks" | "months";
export type OptOutUrgency = "expired" | "critical" | "high" | "medium" | "low";
export type SaasRiskFindingType =
  | "auto_renewal"
  | "missing_notice_deadline"
  | "expired_opt_out"
  | "critical_opt_out";
export type SaasRiskSeverity = "low" | "medium" | "high" | "critical";

export type SaasTermInput = {
  renewalDate?: string | null;
  expirationDate?: string | null;
  noticeDeadlineDate?: string | null;
  noticePeriodValue?: number | null;
  noticePeriodUnit?: NoticePeriodUnit | null;
  autoRenewal?: boolean | null;
};

export type SaasRiskFindingInput = SaasTermInput & {
  today?: string;
};

export type CalculatedSaasRiskFinding = {
  findingType: SaasRiskFindingType;
  severity: SaasRiskSeverity;
  evidence: Record<string, string | number | boolean | null>;
};

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function calculateNoticeDeadline(input: SaasTermInput) {
  if (input.noticeDeadlineDate) {
    return input.noticeDeadlineDate.slice(0, 10);
  }

  const anchor = parseDateOnly(input.renewalDate) ?? parseDateOnly(input.expirationDate);
  if (!anchor || !input.noticePeriodValue || !input.noticePeriodUnit) {
    return null;
  }

  const value = Math.abs(input.noticePeriodValue);
  if (input.noticePeriodUnit === "days") {
    return formatDateOnly(addUtcDays(anchor, -value));
  }

  if (input.noticePeriodUnit === "weeks") {
    return formatDateOnly(addUtcDays(anchor, -value * 7));
  }

  return formatDateOnly(addUtcMonths(anchor, -value));
}

export function daysUntilOptOut(deadline: string | null | undefined, today = formatDateOnly(new Date())) {
  const deadlineDate = parseDateOnly(deadline);
  const todayDate = parseDateOnly(today);
  if (!deadlineDate || !todayDate) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((deadlineDate.getTime() - todayDate.getTime()) / msPerDay);
}

export function getOptOutUrgency(
  deadline: string | null | undefined,
  today?: string
): OptOutUrgency | null {
  const days = daysUntilOptOut(deadline, today);
  if (days === null) return null;
  if (days < 0) return "expired";
  if (days <= 14) return "critical";
  if (days <= 30) return "high";
  if (days <= 60) return "medium";
  return "low";
}

function severityForUrgency(urgency: OptOutUrgency): SaasRiskSeverity {
  if (urgency === "expired" || urgency === "critical") return "critical";
  if (urgency === "high") return "high";
  if (urgency === "medium") return "medium";
  return "low";
}

export function calculateSaasContractRiskFindings(
  input: SaasRiskFindingInput
): CalculatedSaasRiskFinding[] {
  const noticeDeadline = calculateNoticeDeadline(input);
  const urgency = getOptOutUrgency(noticeDeadline, input.today);
  const findings: CalculatedSaasRiskFinding[] = [];

  if (input.autoRenewal) {
    findings.push({
      findingType: "auto_renewal",
      severity: urgency ? severityForUrgency(urgency) : "medium",
      evidence: {
        auto_renewal: true,
        notice_deadline_date: noticeDeadline,
        urgency
      }
    });
  }

  if (input.autoRenewal && !noticeDeadline) {
    findings.push({
      findingType: "missing_notice_deadline",
      severity: "high",
      evidence: {
        auto_renewal: true,
        renewal_date: input.renewalDate ?? null,
        expiration_date: input.expirationDate ?? null,
        notice_period_value: input.noticePeriodValue ?? null,
        notice_period_unit: input.noticePeriodUnit ?? null
      }
    });
  }

  if (urgency === "expired") {
    findings.push({
      findingType: "expired_opt_out",
      severity: "critical",
      evidence: {
        notice_deadline_date: noticeDeadline,
        days_until_opt_out: daysUntilOptOut(noticeDeadline, input.today)
      }
    });
  } else if (urgency === "critical") {
    findings.push({
      findingType: "critical_opt_out",
      severity: "critical",
      evidence: {
        notice_deadline_date: noticeDeadline,
        days_until_opt_out: daysUntilOptOut(noticeDeadline, input.today)
      }
    });
  }

  return findings;
}
