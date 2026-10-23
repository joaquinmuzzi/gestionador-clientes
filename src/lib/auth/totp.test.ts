import { generateHOTP } from "@oslojs/otp";
import { describe, expect, it } from "vitest";
import { currentTotpStep, totpKeyUri, verifyTotp } from "./totp";

// RFC 6238 appendix B test key (SHA-1).
const key = new TextEncoder().encode("12345678901234567890");

describe("verifyTotp", () => {
  it("matches the RFC 6238 test vector", () => {
    // T = 59s -> 94287082 (8 digits); its last 6 digits are the 6-digit code.
    expect(verifyTotp(key, "287082", null, 59_000)).toBe(1);
  });

  it("accepts one step of clock drift and nothing beyond", () => {
    const now = 1_700_000_000_000;
    const step = currentTotpStep(now);
    const codeAt = (s: number) => generateHOTP(key, BigInt(s), 6);
    expect(verifyTotp(key, codeAt(step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(key, codeAt(step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(key, codeAt(step - 2), null, now)).toBeNull();
    expect(verifyTotp(key, codeAt(step + 2), null, now)).toBeNull();
  });

  it("rejects a code that was already used", () => {
    const now = 1_700_000_000_000;
    const step = currentTotpStep(now);
    const code = generateHOTP(key, BigInt(step), 6);
    expect(verifyTotp(key, code, step, now)).toBeNull();
    expect(verifyTotp(key, code, step - 1, now)).toBe(step);
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(key, "", null)).toBeNull();
    expect(verifyTotp(key, "12345", null)).toBeNull();
    expect(verifyTotp(key, "abcdef", null)).toBeNull();
  });
});

describe("totpKeyUri", () => {
  it("builds an otpauth URI for authenticator apps", () => {
    const uri = totpKeyUri("tecnico@ejemplo.local", key);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(uri).toContain("issuer=Gestionador+de+Clientes");
  });
});
