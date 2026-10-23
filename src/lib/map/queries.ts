import type { DeviceType as PrismaDeviceType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { toDay } from "@/lib/devices/records";
import { ADDRESS_FIELD_PREFIXES, deviceAddress, type DeviceType } from "./input";

// Fails to compile if the editor's list of types and the Prisma enum drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const typesMatch: Same<DeviceType, PrismaDeviceType> = true;
void typesMatch;

// What the map editor needs to draw a customer's diagram, and nothing else.
// Of the fields, only the address shown under each device leaves the server,
// picked here from the non-secret ones, so no secret travels with the map. Each
// device carries what flags it on the map (open incidents, the next pending
// task); whether a task is overdue is decided in the browser, in the
// technician's time zone.
// Callers check the session first (requireUser).
export async function getCustomerMap(customerId: string) {
  const [devices, connections] = await Promise.all([
    db.device.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        name: true,
        positionX: true,
        positionY: true,
        _count: { select: { incidents: { where: { resolvedAt: null } } } },
        agendaItems: {
          where: { doneAt: null },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: { dueAt: true },
        },
        fields: {
          // Only the candidates for deviceAddress, not every long value.
          where: {
            isSecret: false,
            OR: ADDRESS_FIELD_PREFIXES.map((prefix) => ({
              name: { startsWith: prefix, mode: "insensitive" as const },
            })),
          },
          orderBy: { position: "asc" },
          select: { name: true, value: true },
        },
      },
    }),
    db.connection.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, sourceId: true, targetId: true, label: true },
    }),
  ]);
  return {
    devices: devices.map(({ _count, agendaItems, fields, ...device }) => ({
      ...device,
      address: deviceAddress(fields),
      alerts: {
        openIncidents: _count.incidents,
        nextDueAt: agendaItems[0] ? toDay(agendaItems[0].dueAt) : null,
      },
    })),
    connections,
  };
}

export type CustomerMap = Awaited<ReturnType<typeof getCustomerMap>>;
