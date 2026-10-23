import type { Severity as PrismaSeverity } from "@/generated/prisma/client";
import { attachmentSelect } from "@/lib/attachments/queries";
import { db } from "@/lib/db";
import { toDay, type Severity } from "./records";

// Fails to compile if the sheet's list of severities and the Prisma enum drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const severitiesMatch: Same<Severity, PrismaSeverity> = true;
void severitiesMatch;

// What the device sheet shows when it opens. A secret field comes without its
// value (`encryptedValue` is never selected): it reaches the browser only
// through revealSecretField, which logs it. Callers check the session first
// (requireUser).
export async function getDeviceSheet(customerId: string, deviceId: string) {
  const device = await db.device.findFirst({
    where: { id: deviceId, customerId },
    select: {
      id: true,
      type: true,
      name: true,
      roles: true,
      notes: true,
      fields: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, value: true, isSecret: true },
      },
      attachments: { orderBy: { createdAt: "asc" }, select: attachmentSelect },
      // The latest incident first; the agenda in date order.
      incidents: {
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          occurredAt: true,
          title: true,
          description: true,
          resolution: true,
          resolvedAt: true,
        },
      },
      vulnerabilities: {
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, severity: true, description: true, resolvedAt: true },
      },
      agendaItems: {
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, dueAt: true, title: true, notes: true, doneAt: true },
      },
    },
  });
  if (!device) return null;

  // The sheet edits days and open or closed, the shape its actions take back.
  const { incidents, vulnerabilities, agendaItems, ...rest } = device;
  return {
    ...rest,
    incidents: incidents.map(({ occurredAt, resolvedAt, ...incident }) => ({
      ...incident,
      occurredAt: toDay(occurredAt),
      closed: resolvedAt !== null,
    })),
    vulnerabilities: vulnerabilities.map(({ resolvedAt, ...vulnerability }) => ({
      ...vulnerability,
      closed: resolvedAt !== null,
    })),
    agendaItems: agendaItems.map(({ dueAt, doneAt, ...item }) => ({
      ...item,
      dueAt: toDay(dueAt),
      closed: doneAt !== null,
    })),
  };
}

export type DeviceSheet = NonNullable<Awaited<ReturnType<typeof getDeviceSheet>>>;
export type SheetField = DeviceSheet["fields"][number];
export type SheetIncident = DeviceSheet["incidents"][number];
export type SheetVulnerability = DeviceSheet["vulnerabilities"][number];
export type SheetAgendaItem = DeviceSheet["agendaItems"][number];
