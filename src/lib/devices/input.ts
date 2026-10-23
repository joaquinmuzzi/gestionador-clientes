import { z } from "zod";
import { collapseSpaces } from "@/lib/customers/input";
import type { DeviceType } from "@/lib/map/input";

// Validation of what the device sheet sends to its Server Actions. No database
// access, so the sheet (a client component) shares the limits and suggestions.

export const FIELD_NAME_MAX_LENGTH = 120;
// A long config or a private key fits; a single field can't fill the database.
export const FIELD_VALUE_MAX_LENGTH = 20_000;
export const DEVICE_TEXT_MAX_LENGTH = 20_000;
// Fields are unlimited in practice; this only bounds one reorder request.
const REORDER_MAX = 2_000;

// The encryption context of a secret field's value (src/lib/crypto.ts), as
// documented on the DeviceField model.
export function fieldValueContext(fieldId: string): string {
  return `device-field:${fieldId}:value`;
}

const idSchema = z.uuid();

// Browsers send textarea line breaks as CRLF; the database keeps LF. Values
// keep their spaces: in a config or a password they can matter.
function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

// Error messages are interface text, so they are in Spanish.
const fieldName = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .min(1, "Poné un nombre al campo.")
      .max(
        FIELD_NAME_MAX_LENGTH,
        `El nombre del campo puede tener hasta ${FIELD_NAME_MAX_LENGTH} caracteres.`,
      ),
  );

const fieldValue = z
  .string()
  .transform(normalizeLineBreaks)
  .pipe(
    z
      .string()
      .max(FIELD_VALUE_MAX_LENGTH, `El valor puede tener hasta ${FIELD_VALUE_MAX_LENGTH} caracteres.`),
  );

const deviceText = z
  .string()
  .transform((value) => normalizeLineBreaks(value).trim())
  .pipe(
    z
      .string()
      .max(DEVICE_TEXT_MAX_LENGTH, `El texto puede tener hasta ${DEVICE_TEXT_MAX_LENGTH} caracteres.`),
  );

// The sheet creates the ids, so a field can be edited before the server has
// answered (and its encryption context is known from the start).
export const newFieldSchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  name: fieldName,
  value: fieldValue,
  isSecret: z.boolean(),
});

// `value` left out means "keep the current one": a secret's value never
// reaches the sheet, so it can't send it back.
export const fieldUpdateSchema = z.object({
  id: idSchema,
  name: fieldName,
  value: fieldValue.optional(),
  isSecret: z.boolean(),
});

export const fieldOrderSchema = z.object({
  deviceId: idSchema,
  fieldIds: z.array(idSchema).min(1).max(REORDER_MAX),
});

export const revealSchema = z.object({
  id: idSchema,
  // Both are logged as REVEAL; the summary says which one it was.
  purpose: z.enum(["view", "copy"]),
});

export const deviceTextsSchema = z.object({
  deviceId: idSchema,
  roles: deviceText,
  notes: deviceText,
});

export type NewField = z.infer<typeof newFieldSchema>;
export type FieldUpdate = z.infer<typeof fieldUpdateSchema>;

// Quick-add buttons on the sheet. They are suggestions, never required
// (principle 2): the technician can name a field anything.
export type FieldSuggestion = { name: string; secret?: boolean };

const ADMIN_LOGIN: FieldSuggestion[] = [
  { name: "Usuario" },
  { name: "Contraseña", secret: true },
];

export const FIELD_SUGGESTIONS: Record<DeviceType, FieldSuggestion[]> = {
  ROUTER: [
    { name: "IP LAN" },
    { name: "IP WAN" },
    { name: "Máscara" },
    { name: "Gateway" },
    { name: "DNS" },
    { name: "DHCP" },
    ...ADMIN_LOGIN,
  ],
  SWITCH: [{ name: "IP de gestión" }, { name: "VLANs" }, { name: "Modelo" }, ...ADMIN_LOGIN],
  SERVER: [
    { name: "IP" },
    { name: "Sistema operativo" },
    { name: "Roles y servicios" },
    { name: "Discos" },
    ...ADMIN_LOGIN,
  ],
  PC: [{ name: "IP" }, { name: "Sistema operativo" }, { name: "Usuario habitual" }, ...ADMIN_LOGIN],
  NAS: [{ name: "IP" }, { name: "Discos y RAID" }, { name: "Backups" }, ...ADMIN_LOGIN],
  FIREWALL: [
    { name: "IP LAN" },
    { name: "IP WAN" },
    { name: "Reglas" },
    { name: "VPN" },
    ...ADMIN_LOGIN,
  ],
  ACCESS_POINT: [{ name: "IP" }, { name: "SSID" }, { name: "Clave Wi-Fi", secret: true }],
  PRINTER: [{ name: "IP" }, { name: "Modelo" }, { name: "Insumos" }],
  CLOUD: [{ name: "Proveedor" }, { name: "URL" }, ...ADMIN_LOGIN],
  OTHER: [{ name: "IP" }, { name: "Modelo" }, ...ADMIN_LOGIN],
};

// The suggestions not yet used on the device, ignoring case.
export function remainingSuggestions(
  type: DeviceType,
  existingNames: Iterable<string>,
): FieldSuggestion[] {
  const taken = new Set(Array.from(existingNames, (name) => collapseSpaces(name).toLowerCase()));
  return FIELD_SUGGESTIONS[type].filter((suggestion) => !taken.has(suggestion.name.toLowerCase()));
}
