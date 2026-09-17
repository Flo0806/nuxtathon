// "Jul 18 - 19, 2026 · UTC", rendered in the event's own zone like the start page.
export function formatDateRange(startsAt: string, endsAt: string, timeZone = "UTC"): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(new Date(iso));
  const start = fmt(startsAt, { month: "short", day: "numeric" });
  const end = fmt(endsAt, { day: "numeric", year: "numeric" });
  return `${start} - ${end} · ${timeZone}`;
}
