import type { Locator, Page } from "@playwright/test";
import { decryptString, encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";
import { fieldValueContext } from "@/lib/devices/input";
import { expect, login, test } from "./fixtures";

// Customers made here start with "E2E ", like in the other specs. Audit
// entries name the device and the field, so they are found through the ids.
// The secret is made up.
const PREFIX = "E2E ";
const SECRET = "fake-Secret-9f2c#e2e";

async function removeTestCustomers() {
  const customers = await db.customer.findMany({
    where: { name: { startsWith: PREFIX } },
    select: {
      id: true,
      devices: { select: { id: true, fields: { select: { id: true } } } },
      connections: { select: { id: true } },
    },
  });
  const ids = customers.flatMap((customer) => [
    customer.id,
    ...customer.devices.flatMap((device) => [device.id, ...device.fields.map((field) => field.id)]),
    ...customer.connections.map((connection) => connection.id),
  ]);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function openSheet(page: Page, customerId: string, deviceName: string): Promise<Locator> {
  await page.goto(`/customers/${customerId}`);
  await page.locator(".react-flow__node").filter({ hasText: deviceName }).dblclick();
  const sheet = page.getByRole("dialog", { name: deviceName });
  await expect(sheet.getByRole("heading", { name: "Campos" })).toBeVisible();
  return sheet;
}

test("double click opens the sheet, where free and secret fields are added", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Ficha" } });
  const router = await db.device.create({
    data: { customerId: customer.id, type: "ROUTER", name: "Router oficina" },
  });
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  let sheet = await openSheet(page, customer.id, "Router oficina");
  await expect(sheet.getByText("Todavía no tiene campos.")).toBeVisible();

  // A free field: any name, a multi-line value.
  await sheet.getByRole("button", { name: "Agregar campo", exact: true }).click();
  await sheet.getByLabel("Nombre del campo nuevo").fill("Reservas DHCP");
  await sheet.getByLabel("Nombre del campo nuevo").press("Tab");
  await sheet.getByLabel("Valor de Reservas DHCP").fill("192.0.2.10 impresora\n192.0.2.11 NAS");
  await sheet.getByLabel("Valor de Reservas DHCP").blur();

  // A suggested secret field, typed right away.
  await sheet.getByRole("button", { name: "Agregar campo Contraseña" }).click();
  await sheet.getByLabel("Nuevo valor de Contraseña").fill(SECRET);
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(sheet.getByLabel("Valor de Contraseña oculto")).toBeVisible();

  await sheet.getByLabel("Funciones (quién hace qué)").fill("DHCP y DNS de la oficina.");
  await sheet.getByLabel("Funciones (quién hace qué)").blur();
  await expect(sheet.getByRole("status").first()).toHaveText("Guardado");

  await expect
    .poll(() =>
      db.deviceField.findMany({
        where: { deviceId: router.id },
        orderBy: { position: "asc" },
        select: { name: true, value: true, isSecret: true },
      }),
    )
    .toEqual([
      { name: "Reservas DHCP", value: "192.0.2.10 impresora\n192.0.2.11 NAS", isSecret: false },
      { name: "Contraseña", value: "", isSecret: true },
    ]);
  const secret = await db.deviceField.findFirstOrThrow({
    where: { deviceId: router.id, isSecret: true },
  });
  expect(secret.encryptedValue).not.toContain(SECRET);
  expect(decryptString(secret.encryptedValue!, fieldValueContext(secret.id))).toBe(SECRET);
  expect((await db.device.findUniqueOrThrow({ where: { id: router.id } })).roles).toBe(
    "DHCP y DNS de la oficina.",
  );

  // On a fresh load the secret doesn't reach the browser until "Ver". Only
  // finished requests are read: a streamed response still open never resolves.
  const bodies: Promise<string>[] = [];
  page.on("requestfinished", (request) =>
    bodies.push(
      request.response().then((response) => response?.text() ?? "").catch(() => ""),
    ),
  );
  await page.reload();
  sheet = await openSheet(page, customer.id, "Router oficina");
  await expect(sheet.getByLabel("Valor de Reservas DHCP")).toHaveValue(/192\.0\.2\.11 NAS/);
  expect((await Promise.all(bodies)).some((body) => body.includes(SECRET))).toBe(false);
  expect(await page.content()).not.toContain(SECRET);

  await sheet.getByRole("button", { name: "Ver" }).click();
  await expect(sheet.getByLabel("Valor de Contraseña", { exact: true })).toHaveText(SECRET);
  await sheet.getByRole("button", { name: "Ocultar" }).click();
  await expect(sheet.getByLabel("Valor de Contraseña oculto")).toBeVisible();

  // The order is the technician's.
  await sheet.getByRole("button", { name: "Subir Contraseña" }).click();
  await expect
    .poll(async () =>
      (
        await db.deviceField.findMany({
          where: { deviceId: router.id },
          orderBy: { position: "asc" },
        })
      ).map((field) => field.name),
    )
    .toEqual(["Contraseña", "Reservas DHCP"]);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  const audit = await db.auditLog.findMany({
    where: { entityId: secret.id },
    orderBy: { createdAt: "asc" },
    select: { action: true, summary: true },
  });
  expect(audit).toEqual([
    { action: "CREATE", summary: "Router oficina · Contraseña" },
    { action: "UPDATE", summary: "Router oficina · Contraseña" },
    { action: "REVEAL", summary: "Router oficina · Contraseña (visto)" },
  ]);
  expect(audit.some((entry) => entry.summary.includes(SECRET))).toBe(false);
});

test("a secret can stop being one, and fields are deleted", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Ficha Secreto" } });
  const nas = await db.device.create({
    data: { customerId: customer.id, type: "NAS", name: "NAS" },
  });
  const wifiId = crypto.randomUUID();
  const wifi = await db.deviceField.create({
    data: {
      id: wifiId,
      deviceId: nas.id,
      name: "Clave admin",
      isSecret: true,
      encryptedValue: encryptString(SECRET, fieldValueContext(wifiId)),
    },
  });
  await db.deviceField.create({
    data: { deviceId: nas.id, name: "IP", value: "192.0.2.20", position: 1 },
  });
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

  // Selecting the device and "Abrir ficha" works like a double click.
  await page.goto(`/customers/${customer.id}`);
  await page.locator(".react-flow__node").filter({ hasText: "NAS" }).click();
  await page.getByRole("button", { name: "Abrir ficha" }).click();
  const sheet = page.getByRole("dialog", { name: "NAS" });

  page.once("dialog", (dialog) => dialog.accept());
  await sheet.getByRole("checkbox").first().click();
  await expect(sheet.getByRole("checkbox").first()).not.toBeChecked();
  await expect(sheet.getByLabel("Valor de Clave admin")).toHaveValue(SECRET);
  await expect
    .poll(async () => {
      const field = await db.deviceField.findUniqueOrThrow({ where: { id: wifi.id } });
      return { value: field.value, isSecret: field.isSecret, encryptedValue: field.encryptedValue };
    })
    .toEqual({ value: SECRET, isSecret: false, encryptedValue: null });

  page.once("dialog", (dialog) => dialog.accept());
  await sheet.getByRole("button", { name: "Borrar IP" }).click();
  await expect(sheet.getByLabel("Valor de IP")).toHaveCount(0);
  await expect.poll(() => db.deviceField.count({ where: { deviceId: nas.id } })).toBe(1);

  const audit = await db.auditLog.findMany({
    where: { entityId: wifi.id },
    select: { action: true },
  });
  expect(audit.map((entry) => entry.action).sort()).toEqual(["REVEAL", "UPDATE"]);
});
