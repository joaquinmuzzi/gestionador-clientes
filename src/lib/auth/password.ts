import { randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// Argon2id with the OWASP minimum parameters (19 MiB, 2 passes, 1 thread).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

// A real hash of a random password, used when the email doesn't exist so the
// response takes as long as a wrong password (no user enumeration by timing).
let dummyHash: Promise<string> | undefined;

export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomUUID());
  await verify(await dummyHash, password);
}
