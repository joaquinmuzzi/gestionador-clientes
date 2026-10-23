import { db } from "@/lib/db";
import { TEST_USER, expect, login, test, totpCode } from "./fixtures";

// Interface text is in Spanish
const INVALID = "Email, contraseña o código incorrectos.";

test("without a session every page leads to the login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Gestionador de Clientes" })).toBeVisible();
});

test("responses carry security headers", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("signs in with password and code, and signs out", async ({ page, context }) => {
  await login(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await expect(page.getByText(TEST_USER.email)).toBeVisible();

  const [cookie] = await context.cookies();
  expect(cookie.name).toBe("__Host-session");
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe("Lax");

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("an hour without activity ends the session", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

  await db.session.updateMany({
    where: { user: { email: TEST_USER.email } },
    data: { lastSeenAt: new Date(Date.now() - 61 * 60 * 1000) },
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  expect(await db.session.count({ where: { user: { email: TEST_USER.email } } })).toBe(0);
});

test("a wrong code, password or email gives the same error", async ({ page }) => {
  await login(page, { code: totpCode() === "000000" ? "111111" : "000000" });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);

  await login(page, { password: "another-wrong-password" });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);

  await login(page, { email: "nobody@example.test" });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);
});

test("a code that was already used does not work again", async ({ page }) => {
  const code = totpCode();
  await login(page, { code });
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, { code });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);
});

test("5 failed attempts block the login", async ({ page }) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await login(page, { password: `wrong-password-${attempt}` });
    await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);
  }
  await login(page);
  await expect(page.locator("form").getByRole("alert")).toHaveText(/Demasiados intentos fallidos/);
});
