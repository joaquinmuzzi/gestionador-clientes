// Sample data for development: two made-up customers with a small network.
// Everything is invented (documentation IPs, *.test domains, fake passwords).
//
//   npm run db:seed
//
// It only adds the sample customers that are missing, so it is safe to run
// again, and it refuses to run in production.

import "../scripts/load-env";
import { randomUUID } from "node:crypto";
import type { DeviceType } from "@/generated/prisma/client";
import { encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";

type SampleField = { name: string; value: string; secret?: boolean };
type SampleDevice = {
  key: string;
  type: DeviceType;
  name: string;
  x: number;
  y: number;
  roles?: string;
  fields: SampleField[];
};
type SampleCustomer = {
  name: string;
  notes: string;
  devices: SampleDevice[];
  connections: { source: string; target: string; label?: string }[];
  endUsers: {
    name: string;
    role?: string;
    contact?: string;
    technicalLevel?: string;
    canTouch?: string;
    notes?: string;
    isMainContact?: boolean;
  }[];
};

const SAMPLES: SampleCustomer[] = [
  {
    name: "Estudio Contable Ejemplo",
    notes: "Oficina en planta baja. Abren de 9 a 18.\nEl rack está en el depósito.",
    devices: [
      { key: "fw", type: "FIREWALL", name: "Firewall", x: 0, y: 0, fields: [
        { name: "IP WAN", value: "203.0.113.10" },
        { name: "IP LAN", value: "192.0.2.1" },
        { name: "Usuario admin", value: "admin" },
        { name: "Contraseña admin", value: "clave-de-ejemplo-123", secret: true },
      ] },
      { key: "sw", type: "SWITCH", name: "Switch principal", x: 0, y: 150, fields: [
        { name: "IP", value: "192.0.2.2" },
        { name: "VLANs", value: "10 Administración\n20 Invitados" },
      ] },
      { key: "srv", type: "SERVER", name: "Servidor de archivos", x: -200, y: 300,
        roles: "Backup diario a las 23 h al NAS.", fields: [
        { name: "IP", value: "192.0.2.10" },
        { name: "Sistema", value: "Windows Server" },
      ] },
      { key: "nas", type: "NAS", name: "NAS de backups", x: 200, y: 300, fields: [
        { name: "IP", value: "192.0.2.20" },
        { name: "Discos", value: "2 x 4 TB en RAID 1" },
      ] },
      { key: "pc", type: "PC", name: "PC Recepción", x: 0, y: 450, fields: [
        { name: "IP", value: "DHCP (192.0.2.100 a 192.0.2.200)" },
      ] },
    ],
    connections: [
      { source: "fw", target: "sw", label: "LAN" },
      { source: "sw", target: "srv" },
      { source: "sw", target: "nas" },
      { source: "sw", target: "pc", label: "VLAN 10" },
    ],
    endUsers: [
      { name: "Ana Ejemplo", role: "Socia", contact: "ana@estudio.test", technicalLevel: "Bajo",
        canTouch: "Nada de la red. Puede reiniciar su PC.", isMainContact: true },
      { name: "Bruno Ejemplo", role: "Administración", technicalLevel: "Medio",
        canTouch: "Puede cambiar el tóner y reiniciar el switch si se lo pedimos." },
    ],
  },
  {
    name: "Ferretería Demo",
    notes: "Un solo local. Internet por fibra.",
    devices: [
      { key: "router", type: "ROUTER", name: "Router del proveedor", x: 0, y: 0, fields: [
        { name: "IP", value: "198.51.100.1" },
        { name: "Wi-Fi", value: "Ferreteria-Demo" },
        { name: "Clave Wi-Fi", value: "wifi-falsa-456", secret: true },
      ] },
      { key: "caja", type: "PC", name: "PC Caja", x: 0, y: 150, fields: [
        { name: "IP", value: "198.51.100.20" },
      ] },
      { key: "imp", type: "PRINTER", name: "Impresora", x: 200, y: 150, fields: [
        { name: "IP", value: "198.51.100.30" },
      ] },
    ],
    connections: [
      { source: "router", target: "caja" },
      { source: "router", target: "imp", label: "Wi-Fi" },
    ],
    endUsers: [
      { name: "Carlos Demo", role: "Dueño", contact: "+54 11 0000-0000", technicalLevel: "Bajo",
        notes: "Prefiere que lo llamen antes de ir.", isMainContact: true },
    ],
  },
];

async function seedCustomer(sample: SampleCustomer): Promise<boolean> {
  const existing = await db.customer.findFirst({
    where: { name: { equals: sample.name, mode: "insensitive" } },
  });
  if (existing) return false;

  await db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: sample.name,
        notes: sample.notes,
        endUsers: { create: sample.endUsers },
      },
    });

    const ids = new Map<string, string>();
    for (const device of sample.devices) {
      const created = await tx.device.create({
        data: {
          customerId: customer.id,
          type: device.type,
          name: device.name,
          positionX: device.x,
          positionY: device.y,
          roles: device.roles,
          fields: {
            create: device.fields.map((field, position) => {
              if (!field.secret) return { name: field.name, value: field.value, position };
              const id = randomUUID();
              return {
                id,
                name: field.name,
                position,
                isSecret: true,
                encryptedValue: encryptString(field.value, `device-field:${id}:value`),
              };
            }),
          },
        },
      });
      ids.set(device.key, created.id);
    }

    await tx.connection.createMany({
      data: sample.connections.map((connection) => ({
        customerId: customer.id,
        sourceId: ids.get(connection.source)!,
        targetId: ids.get(connection.target)!,
        label: connection.label,
      })),
    });

    const nas = ids.get("nas");
    if (nas) {
      await tx.incident.create({
        data: {
          deviceId: nas,
          occurredAt: new Date("2026-08-14T10:00:00Z"),
          title: "Un disco del RAID marcado como degradado",
          resolution: "Se reemplazó el disco y se reconstruyó el RAID.",
          resolvedAt: new Date("2026-08-15T18:00:00Z"),
        },
      });
      await tx.agendaItem.create({
        data: {
          deviceId: nas,
          title: "Probar el restore del backup",
          dueAt: new Date("2026-11-30T12:00:00Z"),
        },
      });
    }
    const fw = ids.get("fw");
    if (fw) {
      await tx.vulnerability.create({
        data: { deviceId: fw, title: "Firmware desactualizado", severity: "HIGH" },
      });
    }
  });
  return true;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The sample data is for development only.");
  }
  for (const sample of SAMPLES) {
    const created = await seedCustomer(sample);
    console.log(`${created ? "Created" : "Already there, skipped"}: ${sample.name}`);
  }
}

try {
  await main();
} finally {
  await db.$disconnect();
}
