import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { db } from "@/lib/db";
import { expect, login, test } from "./fixtures";

// Customers made here start with "E2E ", like in the other specs. The images
// are made up: a 1x1 PNG, and a text file that pretends to be one.
const PREFIX = "E2E ";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
// Same default as src/lib/attachments/storage.ts: the server runs from the
// repository root.
const ATTACHMENTS_DIR = path.resolve(process.env.ATTACHMENTS_DIR || path.join("data", "attachments"));

async function storedFiles(): Promise<string[]> {
  try {
    return await readdir(ATTACHMENTS_DIR);
  } catch {
    return [];
  }
}

async function removeTestCustomers() {
  const customers = await db.customer.findMany({
    where: { name: { startsWith: PREFIX } },
    select: {
      id: true,
      devices: { select: { id: true } },
      attachments: { select: { id: true, storageKey: true } },
    },
  });
  const attachments = customers.flatMap((customer) => customer.attachments);
  const ids = customers.flatMap((customer) => [
    customer.id,
    ...customer.devices.map((device) => device.id),
    ...attachments.map((attachment) => attachment.id),
  ]);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });
  await Promise.all(
    attachments.map((attachment) =>
      rm(path.join(ATTACHMENTS_DIR, attachment.storageKey), { force: true }),
    ),
  );
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function openCustomer(page: Page, customerId: string) {
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByRole("region", { name: "Mapa de red" })).toBeVisible();
  // Enabled once React runs the page; a file chosen before would be lost.
  await expect(
    page
      .getByRole("region", { name: "Imágenes del cliente" })
      .getByRole("button", { name: "Agregar imagen" }),
  ).toBeEnabled();
}

// What Ctrl+V does with a screenshot in the clipboard.
async function pasteImage(target: Locator, bytes: Buffer, name = "image.png") {
  await target.evaluate(
    (element, { data, fileName }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], fileName, { type: "image/png" }));
      element.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    },
    { data: [...bytes], fileName: name },
  );
}

test("a customer image is uploaded encrypted, shown, renamed and deleted", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Imágenes" } });
  await openCustomer(page, customer.id);
  const gallery = page.getByRole("region", { name: "Imágenes del cliente" });
  await expect(gallery.getByText("Sin imágenes.")).toBeVisible();

  await gallery.getByLabel("Subir imágenes a Imágenes del cliente").setInputFiles({
    name: "rack.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  const thumbnail = gallery.getByRole("img", { name: "rack.png" });
  await expect(thumbnail).toBeVisible();
  // The browser decoded the image served by the route.
  await expect
    .poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1);

  const attachment = await db.attachment.findFirstOrThrow({ where: { customerId: customer.id } });
  expect(attachment).toMatchObject({
    deviceId: null,
    title: "",
    fileName: "rack.png",
    mimeType: "image/png",
    size: PNG.length,
  });
  // On disk: a random name, and only ciphertext.
  expect(attachment.storageKey).not.toContain("rack");
  const stored = await readFile(path.join(ATTACHMENTS_DIR, attachment.storageKey));
  expect(stored.toString("utf8")).toMatch(/^v1\./);
  expect(stored.includes(PNG.subarray(0, 8))).toBe(false);

  // Served decrypted, never cached, and the view is audited once.
  const url = `/customers/${customer.id}/attachments/${attachment.id}`;
  const response = await page.request.get(url);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(Buffer.from(await response.body()).equals(PNG)).toBe(true);
  const download = await page.request.get(`${url}?download`);
  expect(download.headers()["content-disposition"]).toBe("attachment; filename*=UTF-8''rack.png");

  await gallery.getByLabel("Título de rack.png").fill("Rack  del sótano");
  await gallery.getByLabel("Título de rack.png").press("Enter");
  await expect
    .poll(async () => (await db.attachment.findUnique({ where: { id: attachment.id } }))?.title)
    .toBe("Rack del sótano");

  // Full size; Escape closes it.
  await gallery.getByRole("button", { name: "Ver Rack del sótano" }).click();
  const lightbox = page.getByRole("dialog", { name: "Rack del sótano" });
  await expect(lightbox.getByRole("img", { name: "Rack del sótano" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.accept());
  await gallery.getByRole("button", { name: "Borrar Rack del sótano" }).click();
  await expect(gallery.getByText("Sin imágenes.")).toBeVisible();
  await expect.poll(() => db.attachment.count({ where: { id: attachment.id } })).toBe(0);
  expect(await storedFiles()).not.toContain(attachment.storageKey);
  expect((await page.request.get(url)).status()).toBe(404);

  const audit = await db.auditLog.findMany({
    where: { entityId: attachment.id },
    orderBy: { createdAt: "asc" },
    select: { action: true, summary: true },
  });
  expect(audit.map((entry) => entry.action)).toEqual(["CREATE", "REVEAL", "UPDATE", "DELETE"]);
  expect(audit[0].summary).toBe("E2E Imágenes · rack.png");
  expect(audit[3].summary).toBe("E2E Imágenes · Rack del sótano");
});

test("a file that is not really an image is refused", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Imágenes Falsas" } });
  await openCustomer(page, customer.id);
  const gallery = page.getByRole("region", { name: "Imágenes del cliente" });

  // Named and typed as a PNG, but its bytes are an SVG with a script.
  await gallery.getByLabel("Subir imágenes a Imágenes del cliente").setInputFiles({
    name: "captura.png",
    mimeType: "image/png",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await expect(gallery.getByRole("alert")).toHaveText(
    "Solo se pueden subir imágenes PNG, JPG o WebP.",
  );
  expect(await db.attachment.count({ where: { customerId: customer.id } })).toBe(0);
});

test("a screenshot pasted on the device sheet goes with the device", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Imágenes Ficha" } });
  const firewall = await db.device.create({
    data: { customerId: customer.id, type: "FIREWALL", name: "Firewall" },
  });
  await openCustomer(page, customer.id);
  await page.locator(".react-flow__node").filter({ hasText: "Firewall" }).dblclick();
  const sheet = page.getByRole("dialog", { name: "Firewall" });
  const gallery = sheet.getByRole("region", { name: "Capturas" });
  await expect(gallery.getByText("Sin imágenes.")).toBeVisible();

  await pasteImage(gallery, PNG);
  await expect(gallery.getByRole("img", { name: "image.png" })).toBeVisible();
  const attachment = await db.attachment.findFirstOrThrow({ where: { deviceId: firewall.id } });
  expect(attachment.customerId).toBe(customer.id);
  // The device's images are not the customer's.
  await expect(
    page.getByRole("region", { name: "Imágenes del cliente" }).getByText("Sin imágenes."),
  ).toBeVisible();

  // Another customer's URL, or no session, gets nothing.
  const other = await db.customer.create({ data: { name: "E2E Imágenes Otro" } });
  const foreign = await page.request.get(`/customers/${other.id}/attachments/${attachment.id}`);
  expect(foreign.status()).toBe(404);
  const anonymous = await page.context().browser()!.newContext();
  const noSession = await anonymous.request.get(
    `http://localhost:3100/customers/${customer.id}/attachments/${attachment.id}`,
    { maxRedirects: 0 },
  );
  expect(noSession.status()).toBe(307);
  expect(noSession.headers().location).toContain("/login");
  await anonymous.close();

  // Reopened, the sheet shows it again.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await page.locator(".react-flow__node").filter({ hasText: "Firewall" }).dblclick();
  await expect(sheet.getByRole("img", { name: "image.png" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Deleting the device removes the encrypted file too.
  expect(await storedFiles()).toContain(attachment.storageKey);
  await page.locator(".react-flow__node").filter({ hasText: "Firewall" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("region", { name: "Dispositivo seleccionado" })
    .getByRole("button", { name: "Borrar dispositivo" })
    .click();
  await expect.poll(() => db.attachment.count({ where: { id: attachment.id } })).toBe(0);
  await expect.poll(storedFiles).not.toContain(attachment.storageKey);
});

test("deleting the customer removes its encrypted files", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Imágenes Borrar" } });
  await openCustomer(page, customer.id);
  await page
    .getByRole("region", { name: "Imágenes del cliente" })
    .getByLabel("Subir imágenes a Imágenes del cliente")
    .setInputFiles({ name: "plano.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "plano.png" })).toBeVisible();
  const attachment = await db.attachment.findFirstOrThrow({ where: { customerId: customer.id } });
  expect(await storedFiles()).toContain(attachment.storageKey);

  await page.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Para confirmar, escribí").fill("E2E Imágenes Borrar");
  await page.getByRole("button", { name: "Borrar el cliente" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await db.attachment.count({ where: { id: attachment.id } })).toBe(0);
  expect(await storedFiles()).not.toContain(attachment.storageKey);
});

test("an image close to the 10 MB limit gets through, a larger one does not", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Imágenes Grandes" } });
  await openCustomer(page, customer.id);
  const gallery = page.getByRole("region", { name: "Imágenes del cliente" });
  const input = gallery.getByLabel("Subir imágenes a Imágenes del cliente");

  // A PNG signature and padding: enough for the type check, and it crosses the
  // default 1 MB Server Action limit.
  const big = Buffer.concat([PNG, Buffer.alloc(9.5 * 1024 * 1024)]);
  await input.setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: big });
  await expect(gallery.getByRole("img", { name: "grande.png" })).toBeAttached();
  const attachment = await db.attachment.findFirstOrThrow({ where: { customerId: customer.id } });
  expect(attachment.size).toBe(big.length);

  await input.setInputFiles({
    name: "enorme.png",
    mimeType: "image/png",
    buffer: Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]),
  });
  await expect(gallery.getByRole("alert")).toHaveText(
    "enorme.png: La imagen puede pesar hasta 10 MB.",
  );
  expect(await db.attachment.count({ where: { customerId: customer.id } })).toBe(1);
});
