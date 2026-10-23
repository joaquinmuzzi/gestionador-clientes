import { db } from "@/lib/db";

// The end users shown on the customer page: main contacts first. Callers check
// the session first (requireUser).
export async function getEndUsers(customerId: string) {
  return db.endUser.findMany({
    where: { customerId },
    orderBy: [{ isMainContact: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      contact: true,
      technicalLevel: true,
      canTouch: true,
      notes: true,
      isMainContact: true,
    },
  });
}

export type EndUser = Awaited<ReturnType<typeof getEndUsers>>[number];
