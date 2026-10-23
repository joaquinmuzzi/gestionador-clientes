import { randomBytes } from "node:crypto";
import { createTOTPKeyURI, verifyHOTP } from "@oslojs/otp";

// TOTP (RFC 6238) compatible with Google Authenticator, Aegis, 1Password, etc.
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ISSUER = "Gestionador de Clientes";

export function generateTotpKey(): Uint8Array {
  return new Uint8Array(randomBytes(20));
}

export function totpKeyUri(accountName: string, key: Uint8Array): string {
  return createTOTPKeyURI(ISSUER, accountName, key, PERIOD_SECONDS, DIGITS);
}

export function currentTotpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / PERIOD_SECONDS);
}

// Returns the time step the code belongs to, or null if it's invalid.
// Accepts one step of clock drift each way, and rejects any step at or before
// `lastUsedStep` so an intercepted code can't be replayed.
export function verifyTotp(
  key: Uint8Array,
  code: string,
  lastUsedStep: number | null,
  now = Date.now(),
): number | null {
  const current = currentTotpStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (verifyHOTP(key, BigInt(step), DIGITS, code)) return step;
  }
  return null;
}
