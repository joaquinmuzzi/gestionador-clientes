import { z } from "zod";
import { collapseSpaces } from "@/lib/customers/input";

// Validation of what the map editor sends to its Server Actions. No database
// access, so the editor (a client component) shares the limits and labels.

// Same values as the DeviceType enum in prisma/schema.prisma, in palette order.
export const DEVICE_TYPES = [
  "ROUTER",
  "SWITCH",
  "SERVER",
  "PC",
  "NAS",
  "FIREWALL",
  "ACCESS_POINT",
  "PRINTER",
  "CLOUD",
  "OTHER",
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  ROUTER: "Router",
  SWITCH: "Switch",
  SERVER: "Servidor",
  PC: "PC",
  NAS: "NAS",
  FIREWALL: "Firewall",
  ACCESS_POINT: "Access point",
  PRINTER: "Impresora",
  CLOUD: "Nube",
  OTHER: "Otro",
};

export const DEVICE_NAME_MAX_LENGTH = 120;
export const CONNECTION_LABEL_MAX_LENGTH = 60;
// Far beyond any real diagram, but keeps garbage out of the Float columns.
const COORDINATE_LIMIT = 1_000_000;
// More than anyone selects at once; a single request can't touch the whole table.
const BATCH_MAX = 500;

const idSchema = z.uuid();
const coordinate = z.number().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT);

// Error messages are interface text, so they are in Spanish.
const deviceName = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .min(1, "Poné un nombre al dispositivo.")
      .max(
        DEVICE_NAME_MAX_LENGTH,
        `El nombre puede tener hasta ${DEVICE_NAME_MAX_LENGTH} caracteres.`,
      ),
  );

const connectionLabel = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .max(
        CONNECTION_LABEL_MAX_LENGTH,
        `La etiqueta puede tener hasta ${CONNECTION_LABEL_MAX_LENGTH} caracteres.`,
      ),
  );

// The editor creates the ids, so a node can be moved or connected before the
// server has answered.
export const newDeviceSchema = z.object({
  id: idSchema,
  type: z.enum(DEVICE_TYPES),
  name: deviceName,
  x: coordinate,
  y: coordinate,
});

export const deviceUpdateSchema = z.object({
  id: idSchema,
  type: z.enum(DEVICE_TYPES),
  name: deviceName,
});

export const deviceMovesSchema = z
  .array(z.object({ id: idSchema, x: coordinate, y: coordinate }))
  .min(1)
  .max(BATCH_MAX);

export const newConnectionSchema = z
  .object({ id: idSchema, sourceId: idSchema, targetId: idSchema, label: connectionLabel })
  .refine((value) => value.sourceId !== value.targetId, {
    message: "Un dispositivo no se puede conectar consigo mismo.",
  });

export const connectionUpdateSchema = z.object({ id: idSchema, label: connectionLabel });

export const mapDeletionSchema = z.object({
  deviceIds: z.array(idSchema).max(BATCH_MAX),
  connectionIds: z.array(idSchema).max(BATCH_MAX),
});

export type NewDevice = z.infer<typeof newDeviceSchema>;
export type DeviceUpdate = z.infer<typeof deviceUpdateSchema>;
export type DeviceMove = z.infer<typeof deviceMovesSchema>[number];
export type NewConnection = z.infer<typeof newConnectionSchema>;
export type ConnectionUpdate = z.infer<typeof connectionUpdateSchema>;
export type MapDeletion = z.infer<typeof mapDeletionSchema>;

// The first message of a failed parse, for the editor's error line.
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

// "Router", "Router 2", "Router 3"... so new devices are told apart on the map
// until the technician renames them.
export function defaultDeviceName(type: DeviceType, existingNames: Iterable<string>): string {
  const base = DEVICE_TYPE_LABELS[type];
  const taken = new Set(Array.from(existingNames, (name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
