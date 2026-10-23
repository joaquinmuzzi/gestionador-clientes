"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/session";
import { decryptString, encryptString } from "@/lib/crypto";
import { customerIdSchema } from "@/lib/customers/input";
import { db } from "@/lib/db";
import {
  deviceTextsSchema,
  fieldOrderSchema,
  fieldUpdateSchema,
  fieldValueContext,
  newFieldSchema,
  revealSchema,
} from "@/lib/devices/input";
import { getDeviceSheet, type DeviceSheet } from "@/lib/devices/queries";
import { firstIssue } from "@/lib/map/input";

// Autosave of the device sheet. Like the map's actions, every one is scoped to
// the customer in the URL: a field of another customer's device matches
// nothing. A secret's value is only decrypted in revealSecretField and when a
// field stops being secret, and both write a REVEAL entry in the same
// transaction. Audit summaries name the device and the field, never a value.

export type SheetActionResult = { error?: string };

const CUSTOMER_GONE = "Ese cliente ya no existe. Recargá la página.";
const DEVICE_GONE = "Ese dispositivo ya no existe. Recargá la página.";
const FIELD_GONE = "Ese campo ya no existe. Recargá la página.";

const isId = (value: unknown) => z.uuid().safeParse(value).success;

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function fieldSummary(deviceName: string, fieldName: string): string {
  return `${deviceName} · ${fieldName}`;
}

export async function loadDeviceSheet(
  customerId: string,
  deviceId: string,
): Promise<{ sheet?: DeviceSheet; error?: string }> {
  await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  if (!isId(deviceId)) return { error: DEVICE_GONE };
  const sheet = await getDeviceSheet(customerId, deviceId);
  return sheet ? { sheet } : { error: DEVICE_GONE };
}

export async function updateDeviceTexts(
  customerId: string,
  input: unknown,
): Promise<SheetActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = deviceTextsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { deviceId, roles, notes } = parsed.data;

  return db.$transaction(async (tx) => {
    const device = await tx.device.findFirst({
      where: { id: deviceId, customerId },
      select: { name: true },
    });
    if (!device) return { error: DEVICE_GONE };
    await tx.device.update({ where: { id: deviceId }, data: { roles, notes } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "device",
        entityId: deviceId,
        summary: device.name,
      },
    });
    return {};
  });
}

export async function createField(customerId: string, input: unknown): Promise<SheetActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = newFieldSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, deviceId, name, value, isSecret } = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const device = await tx.device.findFirst({
        where: { id: deviceId, customerId },
        select: { name: true, fields: { select: { position: true } } },
      });
      if (!device) return { error: DEVICE_GONE };
      // New fields go last.
      const position = Math.max(-1, ...device.fields.map((field) => field.position)) + 1;
      await tx.deviceField.create({
        data: {
          id,
          deviceId,
          name,
          position,
          isSecret,
          value: isSecret ? "" : value,
          encryptedValue: isSecret ? encryptString(value, fieldValueContext(id)) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "device-field",
          entityId: id,
          summary: fieldSummary(device.name, name),
        },
      });
      return {};
    });
  } catch (error) {
    // The device was deleted between the lookup and the insert.
    if (hasErrorCode(error, "P2003")) return { error: DEVICE_GONE };
    throw error;
  }
}

// Renames a field, changes its value or marks it secret or not. When a secret
// stops being one, its value is returned so the sheet can show it, and the
// reveal is logged.
export async function updateField(
  customerId: string,
  input: unknown,
): Promise<SheetActionResult & { value?: string }> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = fieldUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, name, value, isSecret } = parsed.data;
  const context = fieldValueContext(id);

  return db.$transaction(async (tx) => {
    const field = await tx.deviceField.findFirst({
      where: { id, device: { customerId } },
      select: { value: true, isSecret: true, encryptedValue: true, device: { select: { name: true } } },
    });
    if (!field) return { error: FIELD_GONE };

    const current = () =>
      field.isSecret && field.encryptedValue
        ? decryptString(field.encryptedValue, context)
        : field.value;
    const audit = (action: "UPDATE" | "REVEAL") => ({
      userId: user.id,
      action,
      entityType: "device-field",
      entityId: id,
      summary: fieldSummary(field.device.name, name),
    });

    if (isSecret) {
      // A secret whose value was not sent keeps its ciphertext as it is.
      const plaintext = value ?? (field.isSecret ? null : field.value);
      await tx.deviceField.update({
        where: { id },
        data: {
          name,
          isSecret: true,
          value: "",
          ...(plaintext !== null && { encryptedValue: encryptString(plaintext, context) }),
        },
      });
      await tx.auditLog.create({ data: audit("UPDATE") });
      return {};
    }

    const plaintext = value ?? current();
    await tx.deviceField.update({
      where: { id },
      data: { name, isSecret: false, value: plaintext, encryptedValue: null },
    });
    await tx.auditLog.createMany({
      data: field.isSecret ? [audit("UPDATE"), audit("REVEAL")] : [audit("UPDATE")],
    });
    return field.isSecret ? { value: plaintext } : {};
  });
}

// Deleting what is already gone is not an error: the result is the same.
export async function deleteField(customerId: string, fieldId: string): Promise<SheetActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  if (!isId(fieldId)) return { error: FIELD_GONE };

  await db.$transaction(async (tx) => {
    const field = await tx.deviceField.findFirst({
      where: { id: fieldId, device: { customerId } },
      select: { name: true, device: { select: { name: true } } },
    });
    if (!field) return;
    await tx.deviceField.delete({ where: { id: fieldId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "device-field",
        entityId: fieldId,
        summary: fieldSummary(field.device.name, field.name),
      },
    });
  });
  return {};
}

// The order is not audited, like positions on the map.
export async function reorderFields(customerId: string, input: unknown): Promise<SheetActionResult> {
  await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = fieldOrderSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { deviceId, fieldIds } = parsed.data;

  return db.$transaction(async (tx) => {
    const device = await tx.device.findFirst({
      where: { id: deviceId, customerId },
      select: { id: true },
    });
    if (!device) return { error: DEVICE_GONE };
    // Ids of other devices match nothing, so they can't be moved here.
    for (const [position, id] of fieldIds.entries()) {
      await tx.deviceField.updateMany({ where: { id, deviceId }, data: { position } });
    }
    return {};
  });
}

export async function revealSecretField(
  customerId: string,
  input: unknown,
): Promise<{ value?: string; error?: string }> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) return { error: FIELD_GONE };
  const { id, purpose } = parsed.data;

  return db.$transaction(async (tx) => {
    const field = await tx.deviceField.findFirst({
      where: { id, isSecret: true, device: { customerId } },
      select: { name: true, encryptedValue: true, device: { select: { name: true } } },
    });
    if (!field?.encryptedValue) return { error: FIELD_GONE };
    const value = decryptString(field.encryptedValue, fieldValueContext(id));
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "REVEAL",
        entityType: "device-field",
        entityId: id,
        summary: `${fieldSummary(field.device.name, field.name)} (${purpose === "copy" ? "copiado" : "visto"})`,
      },
    });
    return { value };
  });
}
