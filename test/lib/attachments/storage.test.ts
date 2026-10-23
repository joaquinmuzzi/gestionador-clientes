import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  newStorageKey,
  readAttachmentFile,
  removeAttachmentFiles,
  writeAttachmentFile,
} from "@/lib/attachments/storage";

describe("attachment storage", () => {
  const original = { key: process.env.ENCRYPTION_KEY, dir: process.env.ATTACHMENTS_DIR };
  let dir: string;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    dir = await mkdtemp(path.join(tmpdir(), "attachments-test-"));
    // A subdirectory that does not exist yet: the first write creates it.
    process.env.ATTACHMENTS_DIR = path.join(dir, "files");
  });

  afterEach(async () => {
    process.env.ENCRYPTION_KEY = original.key;
    process.env.ATTACHMENTS_DIR = original.dir;
    await rm(dir, { recursive: true, force: true });
  });

  // A made-up PNG header followed by a recognisable fake password.
  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("fake-router-password-123"),
  ]);

  it("round-trips a file and stores it encrypted under a random name", async () => {
    const id = randomUUID();
    const key = newStorageKey();
    await writeAttachmentFile(key, id, image);

    expect(await readdir(path.join(dir, "files"))).toEqual([key]);
    const stored = await readFile(path.join(dir, "files", key));
    expect(stored.toString("utf8")).toMatch(/^v1\./);
    expect(stored.includes(Buffer.from("fake-router-password-123"))).toBe(false);
    expect(stored.includes(image.subarray(0, 8))).toBe(false);

    expect((await readAttachmentFile(key, id)).equals(image)).toBe(true);
  });

  it("refuses a file read for another attachment or altered on disk", async () => {
    const id = randomUUID();
    const key = newStorageKey();
    await writeAttachmentFile(key, id, image);
    await expect(readAttachmentFile(key, randomUUID())).rejects.toThrow();

    const file = path.join(dir, "files", key);
    const stored = await readFile(file, "utf8");
    // One character in the middle of the ciphertext.
    const middle = Math.floor(stored.length / 2);
    const swapped = stored[middle] === "A" ? "B" : "A";
    await writeFile(file, stored.slice(0, middle) + swapped + stored.slice(middle + 1));
    await expect(readAttachmentFile(key, id)).rejects.toThrow();
  });

  it("only accepts keys it made, so nothing outside the directory is touched", async () => {
    await expect(readAttachmentFile("../../etc/passwd", randomUUID())).rejects.toThrow(
      /storage key/,
    );
    await expect(writeAttachmentFile("../x", randomUUID(), image)).rejects.toThrow(/storage key/);
  });

  it("removes files, ignoring those already gone", async () => {
    const keys = [newStorageKey(), newStorageKey()];
    for (const key of keys) await writeAttachmentFile(key, randomUUID(), image);
    await removeAttachmentFiles([...keys, newStorageKey()]);
    expect(await readdir(path.join(dir, "files"))).toEqual([]);
  });
});
