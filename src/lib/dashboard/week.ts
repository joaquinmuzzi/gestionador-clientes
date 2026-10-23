// Calendar arithmetic on days written "2026-10-23" (see src/lib/devices/records.ts).
// Done in UTC, where a day is always 24 hours, so daylight saving can't shift it.

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

// The seven days, Monday to Sunday, of the week that holds `day`.
export function weekDays(day: string): string[] {
  const weekday = (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const monday = addDays(day, -weekday);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}
