import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { customerIdSchema } from "./input";

// Customer reads shared by the pages and Server Actions in src/app/(app)/customers.
// Callers check the session first (requireUser).

export const SEARCH_MAX_LENGTH = 100;

// Prisma passes `contains` to LIKE without escaping, so "%" or "_" typed in a
// search box would match everything.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function getCustomer(id: string) {
  if (!customerIdSchema.safeParse(id).success) return null;
  return db.customer.findUnique({ where: { id } });
}

// Names are unique ignoring case: "Ferretería López" and "ferretería lópez"
// would be the same customer. The unique index only catches exact duplicates.
export async function isCustomerNameTaken(name: string, exceptId?: string): Promise<boolean> {
  const existing = await db.customer.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      id: exceptId ? { not: exceptId } : undefined,
    },
    select: { id: true },
  });
  return existing !== null;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// The tree on the left of every page: every customer, and the devices of the
// one being looked at. Names and types only, never a field.
export async function getExplorerTree(openCustomerId: string | null) {
  const open = openCustomerId && customerIdSchema.safeParse(openCustomerId).success
    ? openCustomerId
    : null;
  const [customers, openIncidents, devices] = await Promise.all([
    db.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { devices: true, endUsers: true } } },
    }),
    db.incident.findMany({
      where: { resolvedAt: null },
      select: { device: { select: { customerId: true } } },
    }),
    open
      ? db.device.findMany({
          where: { customerId: open },
          orderBy: { name: "asc" },
          select: { id: true, name: true, type: true },
        })
      : Promise.resolve([]),
  ]);
  const withIncidents = new Set(openIncidents.map(({ device }) => device.customerId));
  return {
    customers: customers.map(({ _count, ...customer }) => ({
      ...customer,
      deviceCount: _count.devices,
      endUserCount: _count.endUsers,
      hasOpenIncidents: withIncidents.has(customer.id),
    })),
    openCustomerId: open,
    devices,
  };
}

export type ExplorerTree = Awaited<ReturnType<typeof getExplorerTree>>;
