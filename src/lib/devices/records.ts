import { z } from "zod";
import { collapseSpaces } from "@/lib/customers/input";
import { DEVICE_TEXT_MAX_LENGTH } from "./input";

// Validation of the device's history: incidents, known vulnerabilities and
// agenda items. No database access, so the sheet (a client component) shares
// the limits and the date helpers. None of it is encrypted: it is meant to be
// found by the search, so the sheet warns not to type passwords in it.

export const RECORD_TITLE_MAX_LENGTH = 200;

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

// The entity names used in audit entries and in deleteDeviceRecord.
export const RECORD_KINDS = ["incident", "vulnerability", "agenda-item"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

// Dates are days, without a time: "2026-10-23", as an <input type="date">
// sends them. They are stored as midnight UTC of that day, so the day read
// back is the same in any time zone.
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

// Today in the browser's time zone, which is the technician's.
export function localDay(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "2026-10-23" → "23/10/2026", as dates are written in Argentina.
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

// What the map needs to flag a device: incidents still open and the earliest
// agenda item not done yet.
export type DeviceAlerts = { openIncidents: number; nextDueAt: string | null };

export function isOverdue(day: string, today: string): boolean {
  return day < today;
}

// Why a device is flagged on the map, in words; empty when it is not.
export function attentionReasons(alerts: DeviceAlerts, today: string | null): string[] {
  const reasons: string[] = [];
  if (alerts.openIncidents === 1) reasons.push("1 incidente abierto");
  if (alerts.openIncidents > 1) reasons.push(`${alerts.openIncidents} incidentes abiertos`);
  if (today && alerts.nextDueAt && isOverdue(alerts.nextDueAt, today)) {
    reasons.push("tareas vencidas");
  }
  return reasons;
}

const idSchema = z.uuid();

// Error messages are interface text, so they are in Spanish.
const title = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .min(1, "Poné un título.")
      .max(
        RECORD_TITLE_MAX_LENGTH,
        `El título puede tener hasta ${RECORD_TITLE_MAX_LENGTH} caracteres.`,
      ),
  );

// Browsers send textarea line breaks as CRLF; the database keeps LF.
const text = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .pipe(
    z
      .string()
      .max(DEVICE_TEXT_MAX_LENGTH, `El texto puede tener hasta ${DEVICE_TEXT_MAX_LENGTH} caracteres.`),
  );

const day = z.iso.date("Elegí una fecha válida.").transform(fromDay);

// The sheet creates the ids, like it does for fields, and sends the whole
// record on every change: the action creates it the first time. When it was
// closed (resolved, done) is set by the server.
export const incidentSchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  occurredAt: day,
  title,
  description: text,
  resolution: text,
  closed: z.boolean(),
});

export const vulnerabilitySchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  title,
  severity: z.enum(SEVERITIES),
  description: text,
  closed: z.boolean(),
});

export const agendaItemSchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  dueAt: day,
  title,
  notes: text,
  closed: z.boolean(),
});

export const recordDeletionSchema = z.object({
  kind: z.enum(RECORD_KINDS),
  id: idSchema,
});
