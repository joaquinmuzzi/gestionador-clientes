import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptString, encryptString } from "@/lib/crypto";

describe("crypto", () => {
  const original = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = original;
  });

  it("round-trips a value", () => {
    const encrypted = encryptString("fake-password-123", "device:1:field:2");
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("fake-password-123");
    expect(decryptString(encrypted, "device:1:field:2")).toBe("fake-password-123");
  });

  it("uses a fresh IV every time", () => {
    expect(encryptString("same", "ctx")).not.toBe(encryptString("same", "ctx"));
  });

  it("rejects a ciphertext moved to another context", () => {
    const encrypted = encryptString("secret", "user:a:totp");
    expect(() => decryptString(encrypted, "user:b:totp")).toThrow();
  });

  it("rejects a tampered ciphertext", () => {
    const encrypted = encryptString("secret", "ctx");
    const body = Buffer.from(encrypted.slice(3), "base64url");
    body[14] ^= 1;
    expect(() => decryptString(`v1.${body.toString("base64url")}`, "ctx")).toThrow();
  });

  it("rejects data encrypted with another key", () => {
    const encrypted = encryptString("secret", "ctx");
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptString(encrypted, "ctx")).toThrow();
  });

  it("requires a 32-byte key", () => {
    process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptString("x", "ctx")).toThrow(/32 bytes/);
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptString("x", "ctx")).toThrow(/not set/);
  });
});
