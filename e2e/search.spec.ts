import { encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";
import { fieldValueContext } from "@/lib/devices/input";
import { expect, login, test } from "./fixtures";

// The global search in the header. Customers made here start with "E2E ", like
// in the other specs; the IPs are documentation addresses and the secret is
// made up.
const PREFIX = "E2E ";
const SECRET = "fake-Search-Secret-4d7a";

async function removeTestCustomers() {
  await db.customer.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function seed() {
  const office = await db.customer.create({
    data: { name: "E2E Búsqueda Oficina", notes: "Abre de 9 a 18." },
  });
  const router = await db.device.create({
    data: { customerId: office.id, type: "ROUTER", name: "Router oficina" },
  });
  const nas = await db.device.create({
    data: { customerId: office.id, type: "NAS", name: "NAS backups", positionX: 300 },
  });
  await db.deviceField.create({
    data: { deviceId: router.id, name: "IP LAN", value: "192.0.2.231\nGateway de la oficina" },
  });
  const secretId = crypto.randomUUID();
  await db.deviceField.create({
    data: {
      id: secretId,
      deviceId: router.id,
      name: "Clave secreta del panel",
      isSecret: true,
      encryptedValue: encryptString(SECRET, fieldValueContext(secretId)),
      position: 1,
    },
  });
  await db.connection.create({
    data: { customerId: office.id, sourceId: router.id, targetId: nas.id, label: "VLAN 20" },
  });
  await db.incident.create({
    data: {
      deviceId: nas.id,
      occurredAt: new Date("2026-10-01T00:00:00Z"),
      title: "Disco degradado",
      resolution: "Se cambió el disco 3 del arreglo.",
    },
  });
  await db.endUser.create({
    data: { customerId: office.id, name: "Marta Ejemplo", contact: "marta@example.com" },
  });

  const branch = await db.customer.create({ data: { name: "E2E Búsqueda Sucursal" } });
  const pc = await db.device.create({
    data: { customerId: branch.id, type: "PC", name: "PC caja" },
  });
  await db.deviceField.create({ data: { deviceId: pc.id, name: "IP", value: "192.0.2.232" } });

  return { office, router };
}

test("finds IPs across customers and opens the device on the map", async ({ page }) => {
  const { office, router } = await seed();
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

  // Ctrl+K reaches the box from anywhere, once the page is hydrated.
  const box = page.getByRole("searchbox", { name: "Buscar en todos los clientes" });
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(box).toBeFocused({ timeout: 500 });
  }).toPass();
  await box.fill("192.0.2.23");
  await box.press("Enter");

  await expect(page).toHaveURL(/\/search\?q=192\.0\.2\.23$/);
  await expect(box).toHaveValue("192.0.2.23");
  await expect(page.getByRole("status")).toHaveText("2 resultados para «192.0.2.23».");
  const officeResult = page.getByRole("listitem", { name: "E2E Búsqueda Oficina" });
  const branchResult = page.getByRole("listitem", { name: "E2E Búsqueda Sucursal" });
  await expect(officeResult.getByRole("link", { name: /Router oficina/ })).toContainText(
    "Campo «IP LAN»: 192.0.2.231",
  );
  await expect(branchResult.getByRole("link", { name: /PC caja/ })).toContainText(
    "Campo «IP»: 192.0.2.232",
  );
  await expect(officeResult.locator("mark").first()).toHaveText("192.0.2.23");

  // A device result opens the customer's map with the device's sheet.
  await officeResult.getByRole("link", { name: /Router oficina/ }).click();
  await expect(page).toHaveURL(`/customers/${office.id}?device=${router.id}`);
  const sheet = page.getByRole("dialog", { name: "Router oficina" });
  await expect(sheet.getByLabel("Valor de IP LAN")).toHaveValue(/192\.0\.2\.231/);
  await expect(page.locator(".react-flow__node.selected")).toHaveText(/Router oficina/);
});

test("finds notes, connections, incidents and end users", async ({ page }) => {
  await seed();
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

  const results = page.getByRole("listitem", { name: "E2E Búsqueda Oficina" });
  await page.goto("/search?q=vlan 20");
  await expect(results).toContainText("Conexión Router oficina ↔ NAS backups: VLAN 20");

  await page.goto("/search?q=disco 3");
  await expect(results.getByRole("link", { name: /NAS backups/ })).toContainText(
    "Incidente «Disco degradado»: Se cambió el disco 3 del arreglo.",
  );

  await page.goto("/search?q=marta@example");
  await expect(results).toContainText("Usuario final «Marta Ejemplo» · Contacto: marta@example.com");

  await page.goto("/search?q=de 9 a 18");
  await expect(results).toContainText("Notas del cliente: Abre de 9 a 18.");

  // "%" is a LIKE wildcard: typed in the box it is only a character.
  await page.goto("/search?q=%25%25");
  await expect(page.getByText("Nada coincide con «%%».")).toBeVisible();

  await page.goto("/search?q=a");
  await expect(page.getByText("Escribí al menos 2 letras")).toBeVisible();
});

test("never finds or shows a secret field", async ({ page }) => {
  await seed();
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

  // Neither by its value nor by its name.
  for (const term of [SECRET, "Clave secreta del panel"]) {
    await page.goto(`/search?q=${encodeURIComponent(term)}`);
    await expect(page.getByText(`Nada coincide con «${term}».`)).toBeVisible();
  }

  // A search that finds the device doesn't bring its secret along.
  await page.goto("/search?q=Router oficina");
  await expect(page.getByRole("link", { name: /Router oficina/ })).toBeVisible();
  expect(await page.content()).not.toContain(SECRET);
  expect(await page.content()).not.toContain("Clave secreta del panel");
});
