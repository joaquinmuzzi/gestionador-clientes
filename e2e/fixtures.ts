import { generateHOTP } from "@oslojs/otp";
import { test as base, type Page } from "@playwright/test";
import { currentTotpStep } from "@/lib/auth/totp";
import { createUser } from "@/lib/auth/users";
import { db } from "@/lib/db";

// Fake data only: test user, 20-byte TOTP key, documentation IPs (192.0.2.x).
export const TEST_USER = { email: "e2e@example.test", password: "e2e-test-password" };
const TEST_TOTP_KEY = new TextEncoder().encode("fake-e2e-totp-key-20");
const TEST_IP_PREFIX = "192.0.2.";

export function totpCode(offset = 0): string {
  return generateHOTP(TEST_TOTP_KEY, BigInt(currentTotpStep() + offset), 6);
}

// Each test gets a fresh user and its own client IP (sent as X-Forwarded-For),
// so rate limits and used TOTP codes don't leak between tests or into the
// development data in the same database.
let ipCounter = 0;

export const test = base.extend<{ resetUser: void }>({
  extraHTTPHeaders: async ({}, use) => {
    ipCounter += 1;
    await use({ "x-forwarded-for": `${TEST_IP_PREFIX}${ipCounter}` });
  },
  resetUser: [
    async ({}, use) => {
      await db.loginAttempt.deleteMany({
        where: { OR: [{ email: TEST_USER.email }, { ipAddress: { startsWith: TEST_IP_PREFIX } }] },
      });
      await db.user.deleteMany({ where: { email: TEST_USER.email } });
      await createUser({ ...TEST_USER, totpKey: TEST_TOTP_KEY });
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

// The labels are the Spanish interface text.
export async function login(
  page: Page,
  { email = TEST_USER.email, password = TEST_USER.password, code = totpCode() } = {},
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByLabel("Código de la app de autenticación").fill(code);
  await page.getByRole("button", { name: "Ingresar" }).click();
}
