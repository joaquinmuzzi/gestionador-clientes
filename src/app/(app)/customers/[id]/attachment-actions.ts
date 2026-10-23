"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/session";
import {
  ATTACHMENT_MAX_BYTES,
  EMPTY_FILE,
  NOT_AN_IMAGE,
  TOO_LARGE,
  cleanFileName,
  detectImageType,
  renameSchema,
  uploadSchema,
} from "@/lib/attachments/input";
import { attachmentSelect, type AttachmentItem } from "@/lib/attachments/queries";
import {
  newStorageKey,
  removeAttachmentFiles,
  writeAttachmentFile,
} from "@/lib/attachments/storage";
import { customerIdSchema } from "@/lib/customers/input";
import { db } from "@/lib/db";
import { firstIssue } from "@/lib/map/input";

// Screenshots of a customer or of one of its devices. Like the map's actions,
// every one is scoped to the customer in the URL. The file is encrypted before
// it touches the disk; the row and its audit entry are written in one
// transaction. Audit summaries name the customer or device and the title.

export type AttachmentActionResult = { error?: string };

const CUSTOMER_GONE = "Ese cliente ya no existe. Recargá la página.";
const DEVICE_GONE = "Ese dispositivo ya no existe. Recargá la página.";
const ATTACHMENT_GONE = "Esa imagen ya no existe. Recargá la página.";

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function summary(owner: string, title: string, fileName: string): string {
  return `${owner} · ${title || fileName}`;
}

export async function uploadAttachment(
  customerId: string,
  formData: FormData,
): Promise<AttachmentActionResult & { attachment?: AttachmentItem }> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = uploadSchema.safeParse({
    deviceId: formData.get("deviceId") || null,
    title: formData.get("title") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { deviceId, title } = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: NOT_AN_IMAGE };
  if (file.size === 0) return { error: EMPTY_FILE };
  if (file.size > ATTACHMENT_MAX_BYTES) return { error: TOO_LARGE };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectImageType(bytes);
  if (!mimeType) return { error: NOT_AN_IMAGE };

  const owner = deviceId
    ? await db.device.findFirst({ where: { id: deviceId, customerId }, select: { name: true } })
    : await db.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  if (!owner) return { error: deviceId ? DEVICE_GONE : CUSTOMER_GONE };

  const id = randomUUID();
  const storageKey = newStorageKey();
  const fileName = cleanFileName(file.name);
  await writeAttachmentFile(storageKey, id, bytes);

  try {
    const [attachment] = await db.$transaction([
      db.attachment.create({
        data: { id, customerId, deviceId, title, fileName, mimeType, size: bytes.length, storageKey },
        select: attachmentSelect,
      }),
      db.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "attachment",
          entityId: id,
          summary: summary(owner.name, title, fileName),
        },
      }),
    ]);
    return { attachment };
  } catch (error) {
    // No row points to the file, so it goes.
    await removeAttachmentFiles([storageKey]);
    // The customer or the device was deleted meanwhile.
    if (hasErrorCode(error, "P2003")) return { error: deviceId ? DEVICE_GONE : CUSTOMER_GONE };
    throw error;
  }
}

export async function renameAttachment(
  customerId: string,
  input: unknown,
): Promise<AttachmentActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, title } = parsed.data;

  return db.$transaction(async (tx) => {
    const attachment = await tx.attachment.findFirst({
      where: { id, customerId },
      select: { fileName: true, customer: { select: { name: true } }, device: { select: { name: true } } },
    });
    if (!attachment) return { error: ATTACHMENT_GONE };
    await tx.attachment.update({ where: { id }, data: { title } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "attachment",
        entityId: id,
        summary: summary(
          attachment.device?.name ?? attachment.customer.name,
          title,
          attachment.fileName,
        ),
      },
    });
    return {};
  });
}

// Deleting what is already gone is not an error: the result is the same.
export async function deleteAttachment(
  customerId: string,
  attachmentId: string,
): Promise<AttachmentActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  if (!z.uuid().safeParse(attachmentId).success) return { error: ATTACHMENT_GONE };

  const storageKey = await db.$transaction(async (tx) => {
    const attachment = await tx.attachment.findFirst({
      where: { id: attachmentId, customerId },
      select: {
        title: true,
        fileName: true,
        storageKey: true,
        customer: { select: { name: true } },
        device: { select: { name: true } },
      },
    });
    if (!attachment) return null;
    await tx.attachment.delete({ where: { id: attachmentId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "attachment",
        entityId: attachmentId,
        summary: summary(
          attachment.device?.name ?? attachment.customer.name,
          attachment.title,
          attachment.fileName,
        ),
      },
    });
    return attachment.storageKey;
  });
  // Only once the row is gone for good.
  if (storageKey) await removeAttachmentFiles([storageKey]);
  return {};
}
