import { db } from "@/lib/db";

// What a gallery shows: metadata only. The image itself is served, decrypted,
// by the attachment route. Callers check the session first (requireUser).
export const attachmentSelect = {
  id: true,
  title: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

// The customer's own images, not those of its devices (each device sheet
// shows its own).
export function getCustomerAttachments(customerId: string) {
  return db.attachment.findMany({
    where: { customerId, deviceId: null },
    orderBy: { createdAt: "asc" },
    select: attachmentSelect,
  });
}

export type AttachmentItem = Awaited<ReturnType<typeof getCustomerAttachments>>[number];
