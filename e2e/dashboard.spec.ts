import { encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";
import { fieldValueContext } from "@/lib/devices/input";
import { expect, login, test } from "./fixtures";

// The home page, "Incidentes y agenda" and what the map shows under each
// device. Customers made here start with "E2E ", like in the other specs; the
// IPs are documentation addresses and the secret is made up.
const PREFIX = "E2E ";
const SECRET_IP = "203.0.113.99";

async function removeTestCustomers() {
  await db.customer.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function seed() {
  const customer = await db.customer.create({
    data: { name: "E2E Panel Estudio", notes: "Casa central y sucursal" },
  });
  const router = await db.device.create({
    data: { customerId: customer.id, type: "ROUTER", name: "Router panel" },
  });
  const nas = await db.device.create({
    data: { customerId: customer.id, type: "NAS", name: "NAS panel", positionX: 300 },
  });
  const secretId = crypto.randomUUID();
  await db.deviceField.createMany({
    data: [
      {
        id: secretId,
        deviceId: router.id,
        name: "IP WAN",
        isSecret: true,
        encryptedValue: encryptString(SECRET_IP, fieldValueContext(secretId)),
      },
      { deviceId: router.id, name: "IP LAN", value: "192.0.2.1\nGateway", position: 1 },
    ],
  });
  await db.incident.createMany({
    data: [
      { deviceId: nas.id, occurredAt: new Date("2026-10-20T00:00:00Z"), title: "Disco degradado" },
      {
        deviceId: nas.id,
        occurredAt: new Date("2026-09-01T00:00:00Z"),
        title: "Backup sin espacio",
        resolution: "Se amplió el volumen.",
        resolvedAt: new Date("2026-09-02T00:00:00Z"),
      },
    ],
  });
  await db.agendaItem.create({
    data: { deviceId: router.id, title: "Restore del panel", dueAt: new Date("2020-01-15T00:00:00Z") },
  });
  return customer;
}

test("the home page shows the customers and what is pending", async ({ page }) => {
  await seed();
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

  const card = page
    .getByRole("region", { name: "Clientes", exact: true })
    .getByRole("link", { name: /E2E Panel Estudio/ });
  await expect(card).toContainText("Casa central y sucursal");
  await expect(card).toContainText("2 dispositivos");
  await expect(card).toContainText("1 incidente abierto");

  const agenda = page.getByRole("region", { name: "Agenda próxima" });
  await expect(agenda.getByRole("link", { name: /Restore del panel/ })).toContainText(
    "Vencida · 15/01/2020",
  );

  const incidents = page.getByRole("region", { name: "Incidentes abiertos" });
  await expect(incidents.getByText("Backup sin espacio")).toHaveCount(0);
  await incidents.getByRole("link", { name: /Disco degradado/ }).click();
  await expect(page.getByRole("dialog", { name: "NAS panel" })).toBeVisible();
});

test("the tree on the left leads to each customer and its devices", async ({ page }) => {
  await seed();
  await login(page);
  const tree = page.getByRole("tree", { name: "Clientes y dispositivos" });
  const customer = tree.getByRole("treeitem", { name: /E2E Panel Estudio/ });
  await expect(customer).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { name: "Router panel" })).toHaveCount(0);

  await customer.click();
  await expect(page.getByRole("heading", { name: "E2E Panel Estudio", exact: true })).toBeVisible();
  await expect(customer).toHaveAttribute("aria-expanded", "true");
  await tree.getByRole("treeitem", { name: "NAS panel" }).click();
  await expect(page.getByRole("dialog", { name: "NAS panel" })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "NAS panel" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // A device added on the map shows up in the tree once it is saved.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Servidor", exact: true }).click();
  await expect(page.getByRole("status").first()).toHaveText("Guardado");
  await expect(tree.getByRole("treeitem", { name: "Servidor", exact: true })).toBeVisible();
});

test("the map shows each device's address, never a secret one", async ({ page }) => {
  const customer = await seed();
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.goto(`/customers/${customer.id}`);

  const router = page.locator(".react-flow__node").filter({ hasText: "Router panel" });
  await expect(router).toContainText("192.0.2.1");
  expect(await page.content()).not.toContain(SECRET_IP);

  // A change on the sheet shows on the map once it is saved.
  await router.dblclick();
  const sheet = page.getByRole("dialog", { name: "Router panel" });
  await sheet.getByLabel("Valor de IP LAN").fill("192.0.2.254");
  await sheet.getByLabel("Valor de IP LAN").blur();
  await expect(sheet.getByRole("status").first()).toHaveText("Guardado");
  await expect(router).toContainText("192.0.2.254");
});

test("incidents and agenda of every customer", async ({ page }) => {
  await seed();
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", {
    name: "Incidentes y agenda",
  }).click();
  await expect(page.getByRole("heading", { name: "Incidentes y agenda" })).toBeVisible();

  await expect(page.getByRole("heading", { name: /tareas? vencidas?/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Restore del panel/ })).toBeVisible();

  const table = page.getByRole("table");
  await expect(table.getByText("Disco degradado")).toBeVisible();
  await expect(table.getByText("Backup sin espacio")).toHaveCount(0);

  await page.getByRole("link", { name: "Resueltos" }).click();
  await expect(page).toHaveURL(/estado=resueltos$/);
  await expect(table.getByText("Backup sin espacio")).toBeVisible();
  await expect(table.getByText("Se amplió el volumen.")).toBeVisible();
  await expect(table.getByText("Disco degradado")).toHaveCount(0);

  await table.getByRole("link", { name: "NAS panel" }).click();
  await expect(page.getByRole("dialog", { name: "NAS panel" })).toBeVisible();
});
