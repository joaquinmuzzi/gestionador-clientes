import { randomUUID } from "node:crypto";
import { encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";
import { expect, test } from "./fixtures";

// Rules the database enforces on its own, whatever the code above it does.
// They need no browser, only the DATABASE_URL database.

const PREFIX = "E2E model ";

async function removeTestCustomers() {
  await db.customer.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function customerWithDevice(name: string) {
  const customer = await db.customer.create({ data: { name: `${PREFIX}${name}` } });
  const device = await db.device.create({
    data: { customerId: customer.id, type: "SERVER", name: "Servidor" },
  });
  return { customer, device };
}

test("a secret field cannot keep its value in clear text", async () => {
  const { device } = await customerWithDevice("secretos");

  await expect(
    db.deviceField.create({
      data: { deviceId: device.id, name: "Clave", value: "fake-password", isSecret: true },
    }),
  ).rejects.toThrow();
  await expect(
    db.deviceField.create({
      data: { deviceId: device.id, name: "IP", value: "192.0.2.10", encryptedValue: "v1.x" },
    }),
  ).rejects.toThrow();

  const id = randomUUID();
  const field = await db.deviceField.create({
    data: {
      id,
      deviceId: device.id,
      name: "Clave",
      isSecret: true,
      encryptedValue: encryptString("fake-password", `device-field:${id}:value`),
    },
  });
  expect(field.value).toBe("");
});

test("a connection joins two devices of the same customer", async () => {
  const first = await customerWithDevice("uno");
  const second = await customerWithDevice("dos");

  await expect(
    db.connection.create({
      data: {
        customerId: first.customer.id,
        sourceId: first.device.id,
        targetId: second.device.id,
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.connection.create({
      data: {
        customerId: first.customer.id,
        sourceId: first.device.id,
        targetId: first.device.id,
      },
    }),
  ).rejects.toThrow();
});

test("an attachment can only point to a device of its own customer", async () => {
  const first = await customerWithDevice("tres");
  const second = await customerWithDevice("cuatro");

  await expect(
    db.attachment.create({
      data: {
        customerId: first.customer.id,
        deviceId: second.device.id,
        fileName: "captura.png",
        mimeType: "image/png",
        size: 1,
        storageKey: `e2e/${randomUUID()}`,
      },
    }),
  ).rejects.toThrow();
});
