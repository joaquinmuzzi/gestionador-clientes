import { z } from "zod";

// Validation of what the technician types about a customer. No database
// access, so the forms (client components) can share the limits and rules.

export const NAME_MAX_LENGTH = 120;
// Room for long notes, but a form can't be used to fill the database.
export const NOTES_MAX_LENGTH = 20_000;

// Two spaces or a trailing space are typos, not a different customer.
export function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

// Error messages are interface text, so they are in Spanish.
export const customerInputSchema = z.object({
  name: z
    .string()
    .transform(collapseSpaces)
    .pipe(
      z
        .string()
        .min(1, "Poné el nombre del cliente.")
        .max(NAME_MAX_LENGTH, `El nombre puede tener hasta ${NAME_MAX_LENGTH} caracteres.`),
    ),
  // Browsers send textarea line breaks as CRLF; the database keeps LF.
  notes: z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .max(NOTES_MAX_LENGTH, `Las notas pueden tener hasta ${NOTES_MAX_LENGTH} caracteres.`),
    ),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof CustomerInput, string>>;
  // What was typed, so the form keeps it after an error.
  values?: CustomerInput;
};

export function parseCustomerForm(
  formData: FormData,
): { success: true; data: CustomerInput } | { success: false; state: CustomerFormState } {
  const raw = {
    name: String(formData.get("name") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = customerInputSchema.safeParse(raw);
  if (parsed.success) return { success: true, data: parsed.data };

  const { fieldErrors } = z.flattenError(parsed.error);
  return {
    success: false,
    state: {
      fieldErrors: { name: fieldErrors.name?.[0], notes: fieldErrors.notes?.[0] },
      values: raw,
    },
  };
}

export const customerIdSchema = z.uuid();

// Deleting a customer erases everything it holds, so the technician types its
// name to confirm. Case and extra spaces don't matter; the name does.
export function confirmsDeletion(customerName: string, typed: string): boolean {
  return collapseSpaces(typed).toLowerCase() === collapseSpaces(customerName).toLowerCase();
}
