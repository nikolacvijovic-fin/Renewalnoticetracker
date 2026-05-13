import { subDays, subMonths, subWeeks } from "date-fns";

const OFFSET_PATTERN = /^-?P\d+[DWM]$/;

export function isValidReminderOffset(offset: string) {
  return OFFSET_PATTERN.test(offset.toUpperCase());
}

export function applyTemplateNoticeDeadline(
  expirationDate: string,
  noticePeriodValue: number | null | undefined,
  noticePeriodUnit: "days" | "weeks" | "months" | null | undefined
) {
  if (!noticePeriodValue || !noticePeriodUnit) return null;
  const date = new Date(expirationDate);
  if (Number.isNaN(date.getTime())) return null;

  if (noticePeriodUnit === "days") return subDays(date, noticePeriodValue).toISOString();
  if (noticePeriodUnit === "weeks") return subWeeks(date, noticePeriodValue).toISOString();
  if (noticePeriodUnit === "months") return subMonths(date, noticePeriodValue).toISOString();

  return null;
}
