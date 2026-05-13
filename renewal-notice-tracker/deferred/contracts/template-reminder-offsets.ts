import { addDays, addMonths, addWeeks, subDays, subMonths, subWeeks } from "date-fns";

const OFFSET_PATTERN = /^-?P\d+[DWM]$/;

export function applyTemplateOffsets(baseDate: string, offsets: string[]) {
  return offsets
    .map((offset) => applyOffset(baseDate, offset))
    .filter((value): value is string => Boolean(value));
}

export function isValidReminderOffset(offset: string) {
  return OFFSET_PATTERN.test(offset.toUpperCase());
}

export function applyOffset(baseDate: string, offset: string) {
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) return null;

  const match = /^([+-]?P)(\d+)([DWM])$/.exec(offset.toUpperCase());
  if (!match) return null;

  const isPositive = !offset.startsWith("-");
  const amount = Number(match[2]);
  const unit = match[3];

  let nextDate = date;
  if (unit === "D") nextDate = isPositive ? addDays(date, amount) : subDays(date, amount);
  if (unit === "W") nextDate = isPositive ? addWeeks(date, amount) : subWeeks(date, amount);
  if (unit === "M") nextDate = isPositive ? addMonths(date, amount) : subMonths(date, amount);

  return nextDate.toISOString();
}
