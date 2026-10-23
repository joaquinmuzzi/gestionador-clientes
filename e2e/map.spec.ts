import type { Locator, Page } from "@playwright/test";
import { db } from "@/lib/db";
import { expect, login, test } from "./fixtures";

// Customers made here start with "E2E ", like in customers.spec.ts. The audit
// entries of their devices and connections are named after the device, so
// they are found through the ids before the customers go.
const PREFIX = "E2E ";

async function removeTestCustomers() {
  const customers = await db.customer.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true, devices: { select: { id: true } }, connections: { select: { id: true } } },
  });
  const ids = customers.flatMap((customer) => [
    customer.id,
    ...customer.devices.map((device) => device.id),
    ...customer.connections.map((connection) => connection.id),
  ]);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function openMap(page: Page, customerId: string) {
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByRole("region", { name: "Mapa de red" })).toBeVisible();
}

function device(page: Page, name: string): Locator {
  return page.locator(".react-flow__node").filter({ hasText: name });
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not on screen");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// A real pointer drag, which is what React Flow listens to.
async function drag(page: Page, from: Locator, to: Locator | { x: number; y: number }) {
  const start = await centre(from);
  const end = "x" in to ? to : await centre(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

test("adds, renames, connects, labels and moves devices, and keeps them", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Mapa" } });
  await openMap(page, customer.id);
  await expect(page.getByText("El mapa está vacío.")).toBeVisible();

  const palette = page.getByRole("complementary", { name: "Agregar dispositivo" });
  await palette.getByRole("button", { name: "Router", exact: true }).click();
  const devicePanel = page.getByRole("region", { name: "Dispositivo seleccionado" });
  await expect(devicePanel.getByLabel("Nombre")).toHaveValue("Router");
  await devicePanel.getByLabel("Nombre").fill("  Router   principal ");
  await devicePanel.getByLabel("Nombre").press("Enter");
  await expect(devicePanel.getByLabel("Nombre")).toHaveValue("Router principal");

  await palette.getByRole("button", { name: "Switch", exact: true }).click();
  await palette.getByRole("button", { name: "Switch", exact: true }).click();
  await expect(device(page, "Switch 2")).toBeVisible();
  await devicePanel.getByLabel("Tipo").selectOption({ label: "NAS" });

  await device(page, "Router principal").hover();
  await drag(
    page,
    device(page, "Router principal").locator(".react-flow__handle-bottom"),
    device(page, "Switch 2").locator(".react-flow__handle-top"),
  );
  const connectionPanel = page.getByRole("region", { name: "Conexión seleccionada" });
  await connectionPanel.getByLabel("Etiqueta").fill("VLAN 20");
  await connectionPanel.getByLabel("Etiqueta").press("Enter");

  await expect
    .poll(async () => {
      const devices = await db.device.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "asc" },
        select: { type: true, name: true },
      });
      const connections = await db.connection.findMany({
        where: { customerId: customer.id },
        select: { label: true },
      });
      return { devices, connections };
    })
    .toEqual({
      devices: [
        { type: "ROUTER", name: "Router principal" },
        { type: "SWITCH", name: "Switch" },
        { type: "NAS", name: "Switch 2" },
      ],
      connections: [{ label: "VLAN 20" }],
    });
  const router = await db.device.findFirstOrThrow({
    where: { customerId: customer.id, name: "Router principal" },
  });

  const before = await centre(device(page, "Router principal"));
  await drag(page, device(page, "Router principal"), { x: before.x - 150, y: before.y + 120 });
  await expect
    .poll(async () => {
      const { positionX, positionY } = await db.device.findUniqueOrThrow({
        where: { id: router.id },
      });
      return { dx: Math.sign(positionX - router.positionX), dy: Math.sign(positionY - router.positionY) };
    })
    .toEqual({ dx: -1, dy: 1 });
  await expect(page.getByRole("status")).toHaveText("Guardado");

  await page.reload();
  await expect(device(page, "Router principal")).toBeVisible();
  await expect(device(page, "Switch 2")).toBeVisible();
  await expect(page.getByText("VLAN 20")).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  const audit = await db.auditLog.findMany({
    where: { entityId: router.id },
    orderBy: { createdAt: "asc" },
    select: { action: true, summary: true },
  });
  expect(audit).toEqual([
    { action: "CREATE", summary: "Router" },
    { action: "UPDATE", summary: "Router principal" },
  ]);
});

test("deleting a device asks first and takes its connections with it", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Mapa Borrar" } });
  const [router, nas] = await Promise.all([
    db.device.create({
      data: { customerId: customer.id, type: "ROUTER", name: "Router", positionX: 0, positionY: 0 },
    }),
    db.device.create({
      data: { customerId: customer.id, type: "NAS", name: "NAS", positionX: 0, positionY: 200 },
    }),
  ]);
  await db.connection.create({
    data: { customerId: customer.id, sourceId: router.id, targetId: nas.id, label: "LAN" },
  });
  await db.deviceField.create({ data: { deviceId: nas.id, name: "IP", value: "192.0.2.20" } });
  await openMap(page, customer.id);
  await expect(page.getByText("LAN")).toBeVisible();

  await device(page, "NAS").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Delete");
  await expect(device(page, "NAS")).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("«NAS»");
    await dialog.accept();
  });
  await page
    .getByRole("region", { name: "Dispositivo seleccionado" })
    .getByRole("button", { name: "Borrar dispositivo" })
    .click();
  await expect(device(page, "NAS")).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);

  await expect.poll(() => db.device.count({ where: { customerId: customer.id } })).toBe(1);
  expect(await db.connection.count({ where: { customerId: customer.id } })).toBe(0);
  expect(await db.deviceField.count({ where: { deviceId: nas.id } })).toBe(0);
  expect(
    await db.auditLog.findMany({
      where: { entityId: nas.id },
      select: { action: true, summary: true },
    }),
  ).toEqual([{ action: "DELETE", summary: "NAS" }]);

  await page.reload();
  await expect(device(page, "Router")).toBeVisible();
  await expect(device(page, "NAS")).toHaveCount(0);
});

test("a connection is deleted on its own, and arrow keys move devices", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Mapa Conexión" } });
  const [pc, printer] = await Promise.all([
    db.device.create({ data: { customerId: customer.id, type: "PC", name: "PC", positionX: 0 } }),
    db.device.create({
      data: { customerId: customer.id, type: "PRINTER", name: "Impresora", positionX: 300 },
    }),
  ]);
  await db.connection.create({
    data: { customerId: customer.id, sourceId: pc.id, targetId: printer.id, label: "USB" },
  });
  await openMap(page, customer.id);

  // A point on the line, away from its label.
  const [a, b] = [await centre(device(page, "PC")), await centre(device(page, "Impresora"))];
  await page.mouse.click(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3);
  await page
    .getByRole("region", { name: "Conexión seleccionada" })
    .getByRole("button", { name: "Borrar conexión" })
    .click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await expect.poll(() => db.connection.count({ where: { customerId: customer.id } })).toBe(0);
  expect(await db.device.count({ where: { customerId: customer.id } })).toBe(2);

  // Moving with the arrow keys is saved too.
  await device(page, "PC").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(async () => (await db.device.findUniqueOrThrow({ where: { id: pc.id } })).positionY)
    .toBeGreaterThan(0);
});
