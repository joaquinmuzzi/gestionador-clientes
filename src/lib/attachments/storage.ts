import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/crypto";
import { attachmentFileContext } from "./input";

// Encrypted attachment files on disk. Each file is named by a random key that
// says nothing about its customer or content, and holds the output of
// encrypt() bound to the attachment's id. The rows live in the database: the
// caller deletes the files of the rows it deletes (removeAttachmentFiles).

const keySchema = z.uuid();

// ATTACHMENTS_DIR is a Docker volume in production (docker-compose.yml); in
// development the files go to ./data/attachments, which git ignores. The
// turbopackIgnore comments keep the build from tracing (and bundling) the
// whole project because of these runtime paths.
function attachmentsDir(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.ATTACHMENTS_DIR || path.join("data", "attachments"),
  );
}

// Only keys this module made reach the file system, so a key can never point
// outside the directory.
function filePath(storageKey: string): string {
  if (!keySchema.safeParse(storageKey).success) throw new Error("Invalid attachment storage key.");
  return path.join(/*turbopackIgnore: true*/ attachmentsDir(), storageKey);
}

export function newStorageKey(): string {
  return randomUUID();
}

// Written to a temporary name and renamed, so a crash never leaves half a file
// under the real key.
export async function writeAttachmentFile(
  storageKey: string,
  attachmentId: string,
  bytes: Buffer,
): Promise<void> {
  const target = filePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, encrypt(bytes, attachmentFileContext(attachmentId)), { mode: 0o600 });
  await rename(temporary, target);
}

export async function readAttachmentFile(storageKey: string, attachmentId: string): Promise<Buffer> {
  const encrypted = await readFile(filePath(storageKey), "utf8");
  return decrypt(encrypted, attachmentFileContext(attachmentId));
}

// Called after the rows are gone. A file that can't be removed stays encrypted
// and orphaned; that is logged rather than failing a deletion that already
// happened.
export async function removeAttachmentFiles(storageKeys: string[]): Promise<void> {
  const results = await Promise.allSettled(
    storageKeys.map(async (storageKey) => rm(filePath(storageKey), { force: true })),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Could not remove an attachment file:", result.reason);
    }
  }
}
