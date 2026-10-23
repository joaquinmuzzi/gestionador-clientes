"use server";

import { Prisma } from "@/generated/prisma/client";
import { removeAttachmentFiles } from "@/lib/attachments/storage";
import { requireUser } from "@/lib/auth/session";
import { customerIdSchema } from "@/lib/customers/input";
import { db } from "@/lib/db";
import {
  connectionUpdateSchema,
  deviceMovesSchema,
  deviceUpdateSchema,
  firstIssue,
  mapDeletionSchema,
  newConnectionSchema,
  newDeviceSchema,
} from "@/lib/map/input";

// Autosave of the map editor. Every action is scoped to the customer in the
// URL: a device or connection id from another customer matches nothing.
// Positions are not audited (every drag would be an entry); everything else is.

export type MapActionResult = { error?: string };

const CUSTOMER_GONE = "Ese cliente ya no existe. Recargá la página.";
const DEVICE_GONE = "Ese dispositivo ya no existe. Recargá la página.";
const CONNECTION_GONE = "Esa conexión ya no existe. Recargá la página.";

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function createDevice(customerId: string, input: unknown): Promise<MapActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = newDeviceSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, type, name, x, y } = parsed.data;

  try {
    await db.$transaction([
      db.device.create({
        data: { id, customerId, type, name, positionX: x, positionY: y },
      }),
      db.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "device",
          entityId: id,
          summary: name,
        },
      }),
    ]);
  } catch (error) {
    // The customer was deleted meanwhile.
    if (hasErrorCode(error, "P2003")) return { error: CUSTOMER_GONE };
    throw error;
  }
  return {};
}

export async function moveDevices(customerId: string, input: unknown): Promise<MapActionResult> {
  await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = deviceMovesSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await db.$transaction(
    parsed.data.map(({ id, x, y }) =>
      db.device.updateMany({ where: { id, customerId }, data: { positionX: x, positionY: y } }),
    ),
  );
  return {};
}

export async function updateDevice(customerId: string, input: unknown): Promise<MapActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = deviceUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, type, name } = parsed.data;

  return db.$transaction(async (tx) => {
    const { count } = await tx.device.updateMany({
      where: { id, customerId },
      data: { type, name },
    });
    if (count === 0) return { error: DEVICE_GONE };
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "device",
        entityId: id,
        summary: name,
      },
    });
    return {};
  });
}

export async function createConnection(
  customerId: string,
  input: unknown,
): Promise<MapActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = newConnectionSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, sourceId, targetId, label } = parsed.data;

  // The composite foreign keys would reject another customer's device too;
  // looking them up first gives a clear error and the names for the audit.
  const devices = await db.device.findMany({
    where: { id: { in: [sourceId, targetId] }, customerId },
    select: { id: true, name: true },
  });
  const source = devices.find((device) => device.id === sourceId);
  const target = devices.find((device) => device.id === targetId);
  if (!source || !target) return { error: DEVICE_GONE };

  try {
    await db.$transaction([
      db.connection.create({ data: { id, customerId, sourceId, targetId, label } }),
      db.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "connection",
          entityId: id,
          summary: `${source.name} – ${target.name}`,
        },
      }),
    ]);
  } catch (error) {
    // A device was deleted between the lookup and the insert.
    if (hasErrorCode(error, "P2003")) return { error: DEVICE_GONE };
    throw error;
  }
  return {};
}

export async function updateConnection(
  customerId: string,
  input: unknown,
): Promise<MapActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = connectionUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, label } = parsed.data;

  return db.$transaction(async (tx) => {
    const { count } = await tx.connection.updateMany({
      where: { id, customerId },
      data: { label },
    });
    if (count === 0) return { error: CONNECTION_GONE };
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "connection",
        entityId: id,
        summary: label,
      },
    });
    return {};
  });
}

// Devices and connections deleted together (a selection, or a device with its
// connections). Deleting what is already gone is not an error: the result is
// the same.
export async function deleteMapElements(
  customerId: string,
  input: unknown,
): Promise<MapActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = mapDeletionSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { deviceIds, connectionIds } = parsed.data;

  const storageKeys = await db.$transaction(async (tx) => {
    const devices = await tx.device.findMany({
      where: { id: { in: deviceIds }, customerId },
      select: { id: true, name: true },
    });
    const connections = await tx.connection.findMany({
      where: { id: { in: connectionIds }, customerId },
      select: { id: true, label: true },
    });
    const attachments = await tx.attachment.findMany({
      where: { deviceId: { in: deviceIds }, customerId },
      select: { storageKey: true },
    });
    // The cascade removes the devices' fields, connections, incidents and
    // attachment rows; the attachments' encrypted files go once the rows are
    // gone.
    await tx.connection.deleteMany({ where: { id: { in: connectionIds }, customerId } });
    await tx.device.deleteMany({ where: { id: { in: deviceIds }, customerId } });
    await tx.auditLog.createMany({
      data: [
        ...devices.map((device) => ({
          userId: user.id,
          action: "DELETE" as const,
          entityType: "device",
          entityId: device.id,
          summary: device.name,
        })),
        ...connections.map((connection) => ({
          userId: user.id,
          action: "DELETE" as const,
          entityType: "connection",
          entityId: connection.id,
          summary: connection.label,
        })),
      ],
    });
    return attachments.map((attachment) => attachment.storageKey);
  });
  await removeAttachmentFiles(storageKeys);
  return {};
}
