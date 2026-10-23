import { z } from "zod";
import { collapseSpaces } from "@/lib/customers/input";

// Validation of screenshots and their titles. No database or file access, so
// the gallery (a client component) shares the limits and the type check.

// A full-screen PNG screenshot is a few MB; this leaves room for photos.
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TITLE_MAX_LENGTH = 200;
const FILE_NAME_MAX_LENGTH = 200;

// Only raster images that browsers show inline. SVG is left out on purpose: it
// can carry scripts.
export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

// The encryption context of an attachment's file (src/lib/crypto.ts), so an
// encrypted file swapped for another row's does not decrypt.
export function attachmentFileContext(attachmentId: string): string {
  return `attachment:${attachmentId}:file`;
}

// The type comes from the first bytes of the file, never from its name or from
// what the browser claims.
export function detectImageType(bytes: Uint8Array): AttachmentType | null {
  const starts = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" <size> "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

// Error messages are interface text, so they are in Spanish.
export const NOT_AN_IMAGE = "Solo se pueden subir imágenes PNG, JPG o WebP.";
export const TOO_LARGE = `La imagen puede pesar hasta ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.`;
export const EMPTY_FILE = "El archivo está vacío.";

// What the browser can check before sending a file; the server checks the
// bytes again.
export function precheckFile(file: { size: number; type: string }): string | null {
  if (file.size === 0) return EMPTY_FILE;
  if (file.size > ATTACHMENT_MAX_BYTES) return TOO_LARGE;
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return NOT_AN_IMAGE;
  return null;
}

// The original name is only shown and offered on download: no path, no control
// characters, bounded length. A pasted screenshot arrives as "image.png".
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = collapseSpaces(base.replace(/[\u0000-\u001f\u007f]/g, ""));
  return clean.slice(0, FILE_NAME_MAX_LENGTH) || "captura";
}

const idSchema = z.uuid();

export const attachmentTitleSchema = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .max(
        ATTACHMENT_TITLE_MAX_LENGTH,
        `El título puede tener hasta ${ATTACHMENT_TITLE_MAX_LENGTH} caracteres.`,
      ),
  );

// The non-file part of an upload. Without deviceId the image belongs to the
// customer itself.
export const uploadSchema = z.object({
  deviceId: idSchema.nullable(),
  title: attachmentTitleSchema,
});

export const renameSchema = z.object({ id: idSchema, title: attachmentTitleSchema });
