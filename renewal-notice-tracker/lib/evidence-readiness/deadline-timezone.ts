export function isValidIanaTimezone(timezone: string | null | undefined) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function localDateInTimezone(now: Date, timezone: string) {
  if (!isValidIanaTimezone(timezone)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function hasDateOnlyDeadlinePassed(input: {
  deadline: string;
  timezone: string | null | undefined;
  now: Date;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) || !input.timezone) return null;
  const localDate = localDateInTimezone(input.now, input.timezone);
  return localDate === null ? null : input.deadline < localDate;
}
