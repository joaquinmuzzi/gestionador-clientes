import type { DeviceType as PrismaDeviceType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { DeviceType } from "./input";

// Fails to compile if the editor's list of types and the Prisma enum drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const typesMatch: Same<DeviceType, PrismaDeviceType> = true;
void typesMatch;

// What the map editor needs to draw a customer's diagram, and nothing else:
// no fields, so no secret leaves the server with the map. Callers check the
// session first (requireUser).
export async function getCustomerMap(customerId: string) {
  const [devices, connections] = await Promise.all([
    db.device.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, name: true, positionX: true, positionY: true },
    }),
    db.connection.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, sourceId: true, targetId: true, label: true },
    }),
  ]);
  return { devices, connections };
}

export type CustomerMap = Awaited<ReturnType<typeof getCustomerMap>>;
