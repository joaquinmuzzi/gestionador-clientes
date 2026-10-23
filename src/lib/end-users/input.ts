import { z } from "zod";
import { collapseSpaces } from "@/lib/customers/input";

// Validation of the profiles of a customer's end users. No database access, so
// the customer page (a client component) shares the limits.

export const END_USER_NAME_MAX_LENGTH = 120;
export const END_USER_SHORT_MAX_LENGTH = 200;
export const END_USER_TEXT_MAX_LENGTH = 20_000;

// Quick picks for the technical level; anything else can be typed.
export const TECHNICAL_LEVELS = ["Bajo", "Medio", "Alto"];

const idSchema = z.uuid();

// Error messages are interface text, so they are in Spanish.
const oneLine = (max: number) =>
  z
    .string()
    .transform(collapseSpaces)
    .pipe(z.string().max(max, `Puede tener hasta ${max} caracteres.`));

// Browsers send textarea line breaks as CRLF; the database keeps LF.
const text = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .pipe(
    z
      .string()
      .max(END_USER_TEXT_MAX_LENGTH, `El texto puede tener hasta ${END_USER_TEXT_MAX_LENGTH} caracteres.`),
  );

// Only the name is needed; the rest of the profile is free text. The page
// creates the id and sends the whole profile on every change.
export const endUserSchema = z.object({
  id: idSchema,
  name: z
    .string()
    .transform(collapseSpaces)
    .pipe(
      z
        .string()
        .min(1, "Poné el nombre de la persona.")
        .max(
          END_USER_NAME_MAX_LENGTH,
          `El nombre puede tener hasta ${END_USER_NAME_MAX_LENGTH} caracteres.`,
        ),
    ),
  role: oneLine(END_USER_SHORT_MAX_LENGTH),
  technicalLevel: oneLine(END_USER_SHORT_MAX_LENGTH),
  contact: text,
  canTouch: text,
  notes: text,
  isMainContact: z.boolean(),
});

export type EndUserInput = z.input<typeof endUserSchema>;
