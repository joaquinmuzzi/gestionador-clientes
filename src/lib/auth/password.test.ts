import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("una-clave-de-prueba");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "una-clave-de-prueba")).toBe(true);
    expect(await verifyPassword(hash, "otra-clave-de-prueba")).toBe(false);
  });

  it("runs a real check for unknown users", async () => {
    await expect(verifyAgainstDummy("lo-que-sea")).resolves.toBeUndefined();
  });
});
