import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Application-level encryption for secrets (AES-256-GCM).
//
// Payload format: "v1.<base64url(iv || ciphertext || authTag)>". The version
// prefix leaves room for key rotation later. The `context` string is bound as
// additional authenticated data, so a ciphertext copied to another row or
// field fails to decrypt (e.g. "user:<id>:totp").

const VERSION = "v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes encoded in base64.");
  }
  return key;
}

export function encrypt(plaintext: Buffer, context: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const payload = Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
  return `${VERSION}.${payload.toString("base64url")}`;
}

export function decrypt(encrypted: string, context: string): Buffer {
  const [version, body] = encrypted.split(".");
  if (version !== VERSION || !body) {
    throw new Error("Unsupported encrypted payload.");
  }
  const payload = Buffer.from(body, "base64url");
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted payload is too short.");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(payload.length - TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH, payload.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv, { authTagLength: TAG_LENGTH });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptString(plaintext: string, context: string): string {
  return encrypt(Buffer.from(plaintext, "utf8"), context);
}

export function decryptString(encrypted: string, context: string): string {
  return decrypt(encrypted, context).toString("utf8");
}
