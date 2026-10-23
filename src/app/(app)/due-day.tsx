"use client";

import { formatDay, isOverdue } from "@/lib/devices/records";
import { useToday } from "./customers/[id]/device-records";

// A task's day, marked when it is overdue. Overdue is decided here, in the
// browser, because it depends on the technician's time zone.
export function DueDay({ day }: { day: string }) {
  const today = useToday();
  if (today && isOverdue(day, today)) {
    return <span className="font-medium text-warn-ink">Vencida · {formatDay(day)}</span>;
  }
  if (today === day) return <span className="font-medium text-accent-ink">Hoy</span>;
  return <>{formatDay(day)}</>;
}
