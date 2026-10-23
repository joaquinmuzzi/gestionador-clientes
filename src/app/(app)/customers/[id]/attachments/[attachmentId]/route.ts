import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { readAttachmentFile } from "@/lib/attachments/storage";
import { db } from "@/lib/db";

// Serves an attachment decrypted, to a logged-in user only, and never lets the
// browser or a proxy keep a copy. `?download` offers it as a file instead of
// showing it.

// A gallery loads the same images every time it opens; one view entry per
// image and user in this window is enough for the audit trail.
const VIEW_AUDIT_WINDOW_MS = 10 * 60 * 1000;

const idSchema = z.uuid();

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/customers/[id]/attachments/[attachmentId]">,
) {
  const user = await requireUser();
  const { id: customerId, attachmentId } = await params;
  if (!idSchema.safeParse(customerId).success || !idSchema.safeParse(attachmentId).success) {
    return notFound();
  }

  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, customerId },
    select: {
      title: true,
      fileName: true,
      mimeType: true,
      storageKey: true,
      customer: { select: { name: true } },
      device: { select: { name: true } },
    },
  });
  if (!attachment) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readAttachmentFile(attachment.storageKey, attachmentId);
  } catch (error) {
    // A missing file, or one that fails authentication (tampered or moved).
    console.error("Could not read attachment", attachmentId, error);
    return notFound();
  }

  const recentView = await db.auditLog.findFirst({
    where: {
      userId: user.id,
      action: "REVEAL",
      entityType: "attachment",
      entityId: attachmentId,
      createdAt: { gt: new Date(Date.now() - VIEW_AUDIT_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (!recentView) {
    const owner = attachment.device?.name ?? attachment.customer.name;
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "REVEAL",
        entityType: "attachment",
        entityId: attachmentId,
        summary: `${owner} · ${attachment.title || attachment.fileName}`,
      },
    });
  }

  const download = new URL(request.url).searchParams.has("download");
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": disposition,
      "Cache-Control": "no-store, private",
      // Opened on its own, the image can't run anything.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
