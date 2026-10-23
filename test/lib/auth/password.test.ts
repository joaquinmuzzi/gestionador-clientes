import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("a-test-password");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "a-test-password")).toBe(true);
    expect(await verifyPassword(hash, "another-test-password")).toBe(false);
  });

  it("runs a real check for unknown users", async () => {
    await expect(verifyAgainstDummy("anything")).resolves.toBeUndefined();
  });
});
