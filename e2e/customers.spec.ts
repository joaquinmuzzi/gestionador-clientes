import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { db } from "@/lib/db";
import { expect, login, test } from "./fixtures";

// Every customer made here starts with "E2E ", so the tests can clean up after
// themselves without touching development data in the same database.
const PREFIX = "E2E ";

async function removeTestCustomers() {
  await db.customer.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await db.auditLog.deleteMany({
    where: { entityType: "customer", summary: { startsWith: PREFIX } },
  });
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function signIn(page: Page) {
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
}

async function createCustomer(page: Page, name: string, notes = "") {
  await page.goto("/");
  await page.getByRole("link", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Notas").fill(notes);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("creates, lists, searches and edits a customer", async ({ page }) => {
  await signIn(page);
  await createCustomer(page, "E2E Estudio Contable", "Router en 192.0.2.1\nAbren a las 9");
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Abren a las 9")).toBeVisible();
  await expect(page.getByRole("region", { name: "Mapa de red" })).toBeVisible();

  await createCustomer(page, "E2E Ferretería");
  await page.goto("/");
  await expect(page.getByRole("link", { name: /E2E Estudio Contable/ })).toContainText(
    "Router en 192.0.2.1",
  );
  await expect(page.getByRole("link", { name: /E2E Ferretería/ })).toContainText(
    "Sin dispositivos",
  );

  await page.getByRole("searchbox", { name: "Buscar clientes" }).fill("contable");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?q=contable$/);
  await expect(page.getByRole("link", { name: /E2E Estudio Contable/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /E2E Ferretería/ })).toHaveCount(0);

  // LIKE wildcards are searched as plain characters.
  await page.goto("/?q=%25");
  await expect(page.getByText("Ningún cliente coincide con la búsqueda.")).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: /E2E Estudio Contable/ }).click();
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Nombre")).toHaveValue("E2E Estudio Contable");
  await page.getByLabel("Nombre").fill("  E2E   Estudio Contable Sur ");
  await page.getByLabel("Notas").fill("Se mudaron");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("heading", { name: "E2E Estudio Contable Sur", exact: true }))
    .toBeVisible();
  await expect(page.getByText("Se mudaron")).toBeVisible();

  const customer = await db.customer.findUniqueOrThrow({
    where: { name: "E2E Estudio Contable Sur" },
  });
  const audit = await db.auditLog.findMany({
    where: { entityType: "customer", entityId: customer.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true } } },
  });
  expect(audit.map((entry) => entry.action)).toEqual(["CREATE", "UPDATE"]);
  expect(audit[0].user?.email).toBe("e2e@example.test");
});

test("names are required and unique ignoring case", async ({ page }) => {
  await signIn(page);
  await createCustomer(page, "E2E Duplicado");

  await page.goto("/customers/new");
  await page.getByLabel("Nombre").fill("   ");
  await page.getByLabel("Notas").fill("Estas notas no se pierden");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Poné el nombre del cliente.");
  await expect(page.getByLabel("Notas")).toHaveValue("Estas notas no se pierden");

  await page.getByLabel("Nombre").fill("e2e duplicado");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Ya hay un cliente con ese nombre.",
  );
  expect(await db.customer.count({ where: { name: { startsWith: PREFIX } } })).toBe(1);
});

test("deleting asks for the name and removes everything the customer holds", async ({
  page,
}) => {
  await signIn(page);
  await createCustomer(page, "E2E Para Borrar");
  const customer = await db.customer.findUniqueOrThrow({ where: { name: "E2E Para Borrar" } });

  // Something under each relation, so the cascade is checked end to end.
  const [router, nas] = await Promise.all([
    db.device.create({ data: { customerId: customer.id, type: "ROUTER", name: "Router" } }),
    db.device.create({ data: { customerId: customer.id, type: "NAS", name: "NAS" } }),
  ]);
  await db.deviceField.create({ data: { deviceId: router.id, name: "IP", value: "192.0.2.1" } });
  await db.connection.create({
    data: { customerId: customer.id, sourceId: router.id, targetId: nas.id, label: "LAN" },
  });
  await db.endUser.create({ data: { customerId: customer.id, name: "Ana", isMainContact: true } });
  await db.incident.create({
    data: { deviceId: nas.id, occurredAt: new Date(), title: "Disco lleno" },
  });
  await db.attachment.create({
    data: {
      customerId: customer.id,
      deviceId: nas.id,
      fileName: "captura.png",
      mimeType: "image/png",
      size: 1,
      storageKey: randomUUID(),
    },
  });

  await page.reload();
  await page.getByRole("link", { name: "Editar" }).click();
  const button = page.getByRole("button", { name: "Borrar el cliente" });
  await expect(button).toBeDisabled();
  await page.getByLabel("Para confirmar, escribí").fill("E2E Para");
  await expect(button).toBeDisabled();
  await page.getByLabel("Para confirmar, escribí").fill("e2e para borrar");
  await button.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /E2E Para Borrar/ })).toHaveCount(0);
  expect(await db.customer.count({ where: { id: customer.id } })).toBe(0);
  expect(await db.device.count({ where: { customerId: customer.id } })).toBe(0);
  expect(await db.deviceField.count({ where: { deviceId: router.id } })).toBe(0);
  expect(await db.connection.count({ where: { customerId: customer.id } })).toBe(0);
  expect(await db.endUser.count({ where: { customerId: customer.id } })).toBe(0);
  expect(await db.incident.count({ where: { deviceId: nas.id } })).toBe(0);
  expect(await db.attachment.count({ where: { customerId: customer.id } })).toBe(0);

  const deletion = await db.auditLog.findFirst({
    where: { entityType: "customer", entityId: customer.id, action: "DELETE" },
  });
  expect(deletion?.summary).toBe("E2E Para Borrar");
});

test("an unknown customer shows the not-found page", async ({ page }) => {
  await signIn(page);
  for (const path of [`/customers/${randomUUID()}`, "/customers/not-a-uuid/edit"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "No encontramos lo que buscabas" }))
      .toBeVisible();
  }
  // Inside <Suspense> the page has already started streaming, so only an
  // unknown route gets the 404 status.
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
});
