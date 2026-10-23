"use server";

import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/session";
import { customerIdSchema } from "@/lib/customers/input";
import { db } from "@/lib/db";
import {
  agendaItemSchema,
  incidentSchema,
  recordDeletionSchema,
  vulnerabilitySchema,
  type RecordKind,
} from "@/lib/devices/records";
import { firstIssue } from "@/lib/map/input";

// Autosave of the device's incidents, vulnerabilities and agenda. Like the
// sheet's other actions, every one is scoped to the customer in the URL, and a
// record stays on the device it was created on. The sheet sends the whole
// record on every change; the first save creates it. Audit summaries name the
// device and the record's title.

export type RecordActionResult = { error?: string };

const CUSTOMER_GONE = "Ese cliente ya no existe. Recargá la página.";
const DEVICE_GONE = "Ese dispositivo ya no existe. Recargá la página.";
const RECORD_GONE = "Ese registro ya no existe. Recargá la página.";

type Tx = Prisma.TransactionClient;

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

// Creates or updates one record of a device. `find` looks it up on that device
// and says when it was closed; `write` stores it with the closing date to use:
// the one it already had, now, or none when it is open again.
async function upsertRecord(
  userId: string,
  customerId: string,
  kind: RecordKind,
  record: { id: string; deviceId: string; title: string; closed: boolean },
  find: (tx: Tx) => Promise<{ closedAt: Date | null } | null>,
  write: (tx: Tx, closedAt: Date | null, exists: boolean) => Promise<unknown>,
): Promise<RecordActionResult> {
  try {
    return await db.$transaction(async (tx) => {
      const device = await tx.device.findFirst({
        where: { id: record.deviceId, customerId },
        select: { name: true },
      });
      if (!device) return { error: DEVICE_GONE };
      const existing = await find(tx);
      const closedAt = record.closed ? (existing?.closedAt ?? new Date()) : null;
      await write(tx, closedAt, existing !== null);
      await tx.auditLog.create({
        data: {
          userId,
          action: existing ? "UPDATE" : "CREATE",
          entityType: kind,
          entityId: record.id,
          summary: `${device.name} · ${record.title}`,
        },
      });
      return {};
    });
  } catch (error) {
    // The id belongs to a record of another device, or the device was deleted
    // between the lookup and the insert.
    if (hasErrorCode(error, "P2002")) return { error: RECORD_GONE };
    if (hasErrorCode(error, "P2003")) return { error: DEVICE_GONE };
    throw error;
  }
}

export async function saveIncident(customerId: string, input: unknown): Promise<RecordActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, deviceId, occurredAt, title, description, resolution } = parsed.data;
  const data = { occurredAt, title, description, resolution };

  return upsertRecord(
    user.id,
    customerId,
    "incident",
    parsed.data,
    async (tx) => {
      const found = await tx.incident.findFirst({
        where: { id, deviceId },
        select: { resolvedAt: true },
      });
      return found && { closedAt: found.resolvedAt };
    },
    (tx, resolvedAt, exists) =>
      exists
        ? tx.incident.update({ where: { id }, data: { ...data, resolvedAt } })
        : tx.incident.create({ data: { id, deviceId, ...data, resolvedAt } }),
  );
}

export async function saveVulnerability(
  customerId: string,
  input: unknown,
): Promise<RecordActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = vulnerabilitySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, deviceId, title, severity, description } = parsed.data;
  const data = { title, severity, description };

  return upsertRecord(
    user.id,
    customerId,
    "vulnerability",
    parsed.data,
    async (tx) => {
      const found = await tx.vulnerability.findFirst({
        where: { id, deviceId },
        select: { resolvedAt: true },
      });
      return found && { closedAt: found.resolvedAt };
    },
    (tx, resolvedAt, exists) =>
      exists
        ? tx.vulnerability.update({ where: { id }, data: { ...data, resolvedAt } })
        : tx.vulnerability.create({ data: { id, deviceId, ...data, resolvedAt } }),
  );
}

export async function saveAgendaItem(customerId: string, input: unknown): Promise<RecordActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = agendaItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, deviceId, dueAt, title, notes } = parsed.data;
  const data = { dueAt, title, notes };

  return upsertRecord(
    user.id,
    customerId,
    "agenda-item",
    parsed.data,
    async (tx) => {
      const found = await tx.agendaItem.findFirst({
        where: { id, deviceId },
        select: { doneAt: true },
      });
      return found && { closedAt: found.doneAt };
    },
    (tx, doneAt, exists) =>
      exists
        ? tx.agendaItem.update({ where: { id }, data: { ...data, doneAt } })
        : tx.agendaItem.create({ data: { id, deviceId, ...data, doneAt } }),
  );
}

// Deleting what is already gone is not an error: the result is the same.
export async function deleteDeviceRecord(
  customerId: string,
  input: unknown,
): Promise<RecordActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = recordDeletionSchema.safeParse(input);
  if (!parsed.success) return { error: RECORD_GONE };
  const { kind, id } = parsed.data;
  const where = { id, device: { customerId } };
  const select = { title: true, device: { select: { name: true } } };

  await db.$transaction(async (tx) => {
    const record =
      kind === "incident"
        ? await tx.incident.findFirst({ where, select })
        : kind === "vulnerability"
          ? await tx.vulnerability.findFirst({ where, select })
          : await tx.agendaItem.findFirst({ where, select });
    if (!record) return;
    if (kind === "incident") await tx.incident.delete({ where: { id } });
    else if (kind === "vulnerability") await tx.vulnerability.delete({ where: { id } });
    else await tx.agendaItem.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: kind,
        entityId: id,
        summary: `${record.device.name} · ${record.title}`,
      },
    });
  });
  return {};
}
