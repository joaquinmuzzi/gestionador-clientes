"use server";

import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/session";
import { customerIdSchema } from "@/lib/customers/input";
import { db } from "@/lib/db";
import { endUserSchema } from "@/lib/end-users/input";
import { firstIssue } from "@/lib/map/input";
import { z } from "zod";

// Autosave of the customer's end users. Every action is scoped to the
// customer in the URL: another customer's end user matches nothing. The page
// sends the whole profile on every change; the first save creates it. Audit
// summaries name the customer and the person.

export type EndUserActionResult = { error?: string };

const CUSTOMER_GONE = "Ese cliente ya no existe. Recargá la página.";
const END_USER_GONE = "Esa persona ya no existe. Recargá la página.";

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function saveEndUser(customerId: string, input: unknown): Promise<EndUserActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  const parsed = endUserSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id, ...data } = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { name: true },
      });
      if (!customer) return { error: CUSTOMER_GONE };
      const existing = await tx.endUser.findFirst({ where: { id, customerId }, select: { id: true } });
      if (existing) await tx.endUser.update({ where: { id }, data });
      else await tx.endUser.create({ data: { id, customerId, ...data } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: existing ? "UPDATE" : "CREATE",
          entityType: "end-user",
          entityId: id,
          summary: `${customer.name} · ${data.name}`,
        },
      });
      return {};
    });
  } catch (error) {
    // The id belongs to another customer's end user, or the customer was
    // deleted between the lookup and the insert.
    if (hasErrorCode(error, "P2002")) return { error: END_USER_GONE };
    if (hasErrorCode(error, "P2003")) return { error: CUSTOMER_GONE };
    throw error;
  }
}

// Deleting what is already gone is not an error: the result is the same.
export async function deleteEndUser(
  customerId: string,
  endUserId: string,
): Promise<EndUserActionResult> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(customerId).success) return { error: CUSTOMER_GONE };
  if (!z.uuid().safeParse(endUserId).success) return { error: END_USER_GONE };

  await db.$transaction(async (tx) => {
    const endUser = await tx.endUser.findFirst({
      where: { id: endUserId, customerId },
      select: { name: true, customer: { select: { name: true } } },
    });
    if (!endUser) return;
    await tx.endUser.delete({ where: { id: endUserId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "end-user",
        entityId: endUserId,
        summary: `${endUser.customer.name} · ${endUser.name}`,
      },
    });
  });
  return {};
}
