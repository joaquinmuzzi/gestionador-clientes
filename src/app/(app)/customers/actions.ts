"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { removeAttachmentFiles } from "@/lib/attachments/storage";
import { requireUser } from "@/lib/auth/session";
import {
  confirmsDeletion,
  customerIdSchema,
  parseCustomerForm,
  type CustomerFormState,
} from "@/lib/customers/input";
import { getCustomer, isCustomerNameTaken, isUniqueViolation } from "@/lib/customers/queries";
import { db } from "@/lib/db";

const NAME_TAKEN = "Ya hay un cliente con ese nombre.";
const NOT_FOUND = "Ese cliente ya no existe.";

export async function createCustomer(
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser();
  const parsed = parseCustomerForm(formData);
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  if (await isCustomerNameTaken(input.name)) {
    return { fieldErrors: { name: NAME_TAKEN }, values: input };
  }

  const id = randomUUID();
  try {
    await db.$transaction([
      db.customer.create({ data: { id, ...input } }),
      db.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "customer",
          entityId: id,
          summary: input.name,
        },
      }),
    ]);
  } catch (error) {
    // Two submissions racing past the check above.
    if (isUniqueViolation(error)) return { fieldErrors: { name: NAME_TAKEN }, values: input };
    throw error;
  }

  redirect(`/customers/${id}`);
}

export async function updateCustomer(
  id: string,
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const user = await requireUser();
  if (!customerIdSchema.safeParse(id).success) return { error: NOT_FOUND };
  const parsed = parseCustomerForm(formData);
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  if (await isCustomerNameTaken(input.name, id)) {
    return { fieldErrors: { name: NAME_TAKEN }, values: input };
  }

  try {
    const [{ count }] = await db.$transaction([
      db.customer.updateMany({ where: { id }, data: input }),
      db.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "customer",
          entityId: id,
          summary: input.name,
        },
      }),
    ]);
    if (count === 0) return { error: NOT_FOUND, values: input };
  } catch (error) {
    if (isUniqueViolation(error)) return { fieldErrors: { name: NAME_TAKEN }, values: input };
    throw error;
  }

  redirect(`/customers/${id}`);
}

export type DeleteCustomerState = { error?: string };

export async function deleteCustomer(
  id: string,
  _previous: DeleteCustomerState,
  formData: FormData,
): Promise<DeleteCustomerState> {
  const user = await requireUser();
  const customer = await getCustomer(id);
  if (!customer) return { error: NOT_FOUND };

  // Checked again here: the disabled button in the browser is only a hint.
  if (!confirmsDeletion(customer.name, String(formData.get("confirmation") ?? ""))) {
    return { error: "El nombre no coincide. Escribilo igual que arriba para borrar el cliente." };
  }

  // The cascade removes its devices, fields, connections, end users and
  // attachment rows (its devices' too); their encrypted files are removed once
  // the rows are gone. The audit entry keeps the name.
  const storageKeys = await db.$transaction(async (tx) => {
    const attachments = await tx.attachment.findMany({
      where: { customerId: customer.id },
      select: { storageKey: true },
    });
    await tx.customer.delete({ where: { id: customer.id } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "customer",
        entityId: customer.id,
        summary: customer.name,
      },
    });
    return attachments.map((attachment) => attachment.storageKey);
  });
  await removeAttachmentFiles(storageKeys);

  redirect("/");
}
