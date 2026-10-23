import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { MIN_PASSWORD_LENGTH, hashPassword } from "./password";

// User management used by the CLI (scripts/user.ts) and the e2e tests.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function totpContext(userId: string): string {
  return `user:${userId}:totp`;
}

function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
}

export function readTotpKey(user: { id: string; totpSecret: string }): Uint8Array {
  return new Uint8Array(decrypt(user.totpSecret, totpContext(user.id)));
}

export async function createUser(input: {
  email: string;
  password: string;
  totpKey: Uint8Array;
  // Step of the code used to confirm enrollment, so it can't be reused to log in.
  totpLastUsedStep?: number;
}): Promise<{ id: string }> {
  assertPasswordStrength(input.password);
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
      totpSecret: encrypt(Buffer.from(input.totpKey), totpContext(id)),
      totpLastUsedStep: input.totpLastUsedStep ?? null,
    },
  });
  return { id };
}

// Replacing the 2FA key or the password logs out every open session.

export async function replaceTotpKey(
  userId: string,
  totpKey: Uint8Array,
  totpLastUsedStep?: number,
): Promise<void> {
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        totpSecret: encrypt(Buffer.from(totpKey), totpContext(userId)),
        totpLastUsedStep: totpLastUsedStep ?? null,
      },
    }),
    db.session.deleteMany({ where: { userId } }),
  ]);
}

export async function replacePassword(userId: string, password: string): Promise<void> {
  assertPasswordStrength(password);
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
}
