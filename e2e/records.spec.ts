import type { Locator, Page } from "@playwright/test";
import { db } from "@/lib/db";
import { expect, login, test } from "./fixtures";

// Incidents, vulnerabilities and the agenda on the device sheet, the flag on
// the map, and the end users of the customer page. Customers made here start
// with "E2E ", like in the other specs; audit entries are found through ids.
const PREFIX = "E2E ";

async function removeTestCustomers() {
  const customers = await db.customer.findMany({
    where: { name: { startsWith: PREFIX } },
    select: {
      id: true,
      endUsers: { select: { id: true } },
      devices: {
        select: {
          id: true,
          incidents: { select: { id: true } },
          vulnerabilities: { select: { id: true } },
          agendaItems: { select: { id: true } },
        },
      },
    },
  });
  const ids = customers.flatMap((customer) => [
    customer.id,
    ...customer.endUsers.map((endUser) => endUser.id),
    ...customer.devices.flatMap((device) => [
      device.id,
      ...[...device.incidents, ...device.vulnerabilities, ...device.agendaItems].map(
        (record) => record.id,
      ),
    ]),
  ]);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });
}

test.beforeEach(removeTestCustomers);
test.afterAll(removeTestCustomers);

async function openSheet(page: Page, deviceName: string): Promise<Locator> {
  await page.locator(".react-flow__node").filter({ hasText: deviceName }).dblclick();
  const sheet = page.getByRole("dialog", { name: deviceName });
  await expect(sheet.getByRole("heading", { name: "Campos" })).toBeVisible();
  return sheet;
}

const flag = (page: Page) => page.getByRole("img", { name: /^Requiere atención/ });

test("incidents, vulnerabilities and tasks are kept on the sheet and flag the map", async ({
  page,
}) => {
  const customer = await db.customer.create({ data: { name: "E2E Historial" } });
  const router = await db.device.create({
    data: { customerId: customer.id, type: "ROUTER", name: "Router oficina" },
  });
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.goto(`/customers/${customer.id}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(flag(page)).toHaveCount(0);
  let sheet = await openSheet(page, "Router oficina");

  // An open incident flags the device on the map.
  const incidents = sheet.getByRole("region", { name: "Incidentes" });
  await expect(incidents.getByText("Sin incidentes registrados.")).toBeVisible();
  await incidents.getByRole("button", { name: "Agregar incidente" }).click();
  const incident = incidents.getByRole("listitem").first();
  await incident.getByLabel("Fecha").fill("2026-10-20");
  await incident.getByLabel("Título").fill("Se cayó la VPN IPsec");
  await incident.getByLabel("Qué pasó").fill("Sin túnel a 198.51.100.7\ndesde las 9");
  await incident.getByLabel("Qué pasó").blur();
  await expect(flag(page)).toHaveAccessibleName("Requiere atención: 1 incidente abierto");
  await expect
    .poll(() =>
      db.incident.findMany({
        where: { deviceId: router.id },
        select: { title: true, description: true, occurredAt: true, resolvedAt: true },
      }),
    )
    .toEqual([
      {
        title: "Se cayó la VPN IPsec",
        description: "Sin túnel a 198.51.100.7\ndesde las 9",
        occurredAt: new Date("2026-10-20T00:00:00.000Z"),
        resolvedAt: null,
      },
    ]);

  const incidentId = (await db.incident.findFirstOrThrow({ where: { deviceId: router.id } })).id;

  // Resolving it takes the flag away.
  await incident.getByLabel("Cómo se resolvió").fill("Se renovó la clave precompartida.");
  await incident.getByLabel("Cómo se resolvió").blur();
  await incident.getByLabel("Resuelto").check();
  await expect(flag(page)).toHaveCount(0);
  await expect
    .poll(async () => (await db.incident.findFirstOrThrow({ where: { deviceId: router.id } })).resolvedAt)
    .not.toBeNull();

  // A known vulnerability.
  const vulnerabilities = sheet.getByRole("region", { name: "Vulnerabilidades" });
  await vulnerabilities.getByRole("button", { name: "Agregar vulnerabilidad" }).click();
  const vulnerability = vulnerabilities.getByRole("listitem").first();
  await vulnerability.getByLabel("Título").fill("Firmware sin actualizar");
  await vulnerability.getByLabel("Título").blur();
  await vulnerability.getByLabel("Gravedad").selectOption("Alta");
  await expect
    .poll(() =>
      db.vulnerability.findMany({
        where: { deviceId: router.id },
        select: { title: true, severity: true, resolvedAt: true },
      }),
    )
    .toEqual([{ title: "Firmware sin actualizar", severity: "HIGH", resolvedAt: null }]);

  // A task whose day has passed is overdue, on the sheet and on the map.
  const agenda = sheet.getByRole("region", { name: "Agenda" });
  await agenda.getByRole("button", { name: "Agregar tarea" }).click();
  const task = agenda.getByRole("listitem").first();
  await task.getByLabel("Título").fill("Probar el restore del backup");
  await task.getByLabel("Título").blur();
  await task.getByLabel("Fecha").fill("2020-01-15");
  await expect(task.getByText("Vencida")).toBeVisible();
  await expect(flag(page)).toHaveAccessibleName("Requiere atención: tareas vencidas");
  await expect
    .poll(() =>
      db.agendaItem.findMany({
        where: { deviceId: router.id },
        select: { title: true, dueAt: true, doneAt: true },
      }),
    )
    .toEqual([
      {
        title: "Probar el restore del backup",
        dueAt: new Date("2020-01-15T00:00:00.000Z"),
        doneAt: null,
      },
    ]);
  await expect(sheet.getByRole("status").first()).toHaveText("Guardado");

  // Everything is there after a reload, and the flag comes from the server.
  await page.reload();
  await expect(flag(page)).toHaveAccessibleName("Requiere atención: tareas vencidas");
  sheet = await openSheet(page, "Router oficina");
  // Records come folded: a line each with the day, the title and the state.
  const summaries = sheet.locator("summary");
  await expect(summaries).toHaveText([
    "20/10/2026Se cayó la VPN IPsecResuelto",
    "Firmware sin actualizarGravedad alta",
    "15/01/2020Probar el restore del backupVencida",
  ]);

  // Done, the task stops flagging; deleted, the incident is gone.
  const savedTask = sheet.getByRole("region", { name: "Agenda" }).getByRole("listitem").first();
  await savedTask.getByText("Probar el restore del backup").click();
  await savedTask.getByLabel("Hecha").check();
  await expect(flag(page)).toHaveCount(0);
  const savedIncident = sheet
    .getByRole("region", { name: "Incidentes" })
    .getByRole("listitem")
    .first();
  await savedIncident.getByText("Se cayó la VPN IPsec").click();
  page.once("dialog", (dialog) => dialog.accept());
  await savedIncident.getByRole("button", { name: "Borrar" }).click();
  await expect(sheet.getByText("Sin incidentes registrados.")).toBeVisible();
  await expect.poll(() => db.incident.count({ where: { deviceId: router.id } })).toBe(0);
  await expect
    .poll(async () => (await db.agendaItem.findFirstOrThrow({ where: { deviceId: router.id } })).doneAt)
    .not.toBeNull();

  // The trail outlives the incident and names the device and the title.
  const audit = await db.auditLog.findMany({
    where: { entityType: "incident", entityId: incidentId },
    select: { action: true, summary: true },
    orderBy: { createdAt: "asc" },
  });
  expect(new Set(audit.map((entry) => entry.summary))).toEqual(
    new Set(["Router oficina · Se cayó la VPN IPsec"]),
  );
  const actions = audit.map((entry) => entry.action);
  expect(actions[0]).toBe("CREATE");
  expect(actions.at(-1)).toBe("DELETE");
  expect(actions.slice(1, -1).every((action) => action === "UPDATE")).toBe(true);
});

test("end users of the customer are added, edited and deleted", async ({ page }) => {
  const customer = await db.customer.create({ data: { name: "E2E Usuarios" } });
  await login(page);
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await page.goto(`/customers/${customer.id}`);

  const section = page.getByRole("region", { name: "Usuarios finales" });
  await expect(section.getByText("Todavía no cargaste a nadie.")).toBeVisible();
  await section.getByRole("button", { name: "Agregar persona" }).click();
  const card = section.getByRole("listitem").first();
  await card.getByLabel("Nombre").fill("Ana Gómez");
  await card.getByLabel("Nombre").blur();
  await card.getByLabel("Puesto").fill("Administración");
  await card.getByLabel("Nivel técnico").fill("Bajo");
  await card.getByLabel("Contacto", { exact: true }).fill("ana@example.com");
  await card.getByLabel("Qué puede y qué no puede tocar").fill("Reinicia el router. No toca el servidor.");
  await card.getByLabel("Cómo tratarlo").fill("Explicarle paso a paso.");
  await card.getByLabel("Cómo tratarlo").blur();
  await card.getByLabel("Contacto principal").check();
  await expect(section.getByRole("status")).toHaveText("Guardado");
  await expect
    .poll(() =>
      db.endUser.findMany({
        where: { customerId: customer.id },
        select: {
          name: true,
          role: true,
          technicalLevel: true,
          contact: true,
          canTouch: true,
          notes: true,
          isMainContact: true,
        },
      }),
    )
    .toEqual([
      {
        name: "Ana Gómez",
        role: "Administración",
        technicalLevel: "Bajo",
        contact: "ana@example.com",
        canTouch: "Reinicia el router. No toca el servidor.",
        notes: "Explicarle paso a paso.",
        isMainContact: true,
      },
    ]);

  // Folded after a reload, with what matters at a glance.
  await page.reload();
  const saved = section.getByRole("listitem").first();
  await expect(saved.locator("summary")).toHaveText(
    "Ana GómezAdministraciónNivel: BajoContacto principal",
  );

  await saved.locator("summary").click();
  page.once("dialog", (dialog) => dialog.accept());
  await saved.getByRole("button", { name: "Borrar" }).click();
  await expect(section.getByText("Todavía no cargaste a nadie.")).toBeVisible();
  await expect.poll(() => db.endUser.count({ where: { customerId: customer.id } })).toBe(0);
});
