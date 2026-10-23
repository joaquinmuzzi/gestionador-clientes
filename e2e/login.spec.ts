import { db } from "@/lib/db";
import { TEST_USER, expect, login, test, totpCode } from "./fixtures";

const INVALID = "Email, contraseña o código incorrectos.";

test("sin sesión, cualquier página lleva al login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Gestionador de Clientes" })).toBeVisible();
});

test("las respuestas llevan cabeceras de seguridad", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("entra con contraseña y código, y sale", async ({ page, context }) => {
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

test("una hora sin actividad cierra la sesión", async ({ page }) => {
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

test("un código o una contraseña incorrectos dan el mismo error", async ({ page }) => {
  await login(page, { code: totpCode() === "000000" ? "111111" : "000000" });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);

  await login(page, { password: "otra-clave-incorrecta" });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);

  await login(page, { email: "nadie@ejemplo.local" });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);
});

test("un código ya usado no sirve de nuevo", async ({ page }) => {
  const code = totpCode();
  await login(page, { code });
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, { code });
  await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);
});

test("después de 5 intentos fallidos bloquea el login", async ({ page }) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await login(page, { password: `clave-incorrecta-${attempt}` });
    await expect(page.locator("form").getByRole("alert")).toHaveText(INVALID);
  }
  await login(page);
  await expect(page.locator("form").getByRole("alert")).toHaveText(/Demasiados intentos fallidos/);
});
