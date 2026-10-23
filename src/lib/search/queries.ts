import { escapeLikePattern } from "@/lib/customers/queries";
import { db } from "@/lib/db";
import { DEVICE_TYPE_LABELS, type DeviceType } from "@/lib/map/input";
import { contains, excerpt, matchingDeviceTypes } from "./input";

// The global search: every text the technician typed that is not a secret.
// Secret fields are left out in the query itself (`isSecret: false`) and
// `encryptedValue` is never selected, so a secret can't reach a result. Callers
// check the session first (requireUser) and pass a term from parseSearchTerm.

// Per kind of row, plenty for one technician; a short term can't load the whole database.
export const RESULTS_PER_KIND = 50;

export type SearchHit = { place: string; text: string };
export type DeviceResult = { id: string; name: string; type: DeviceType; hits: SearchHit[] };
export type CustomerResult = {
  id: string;
  name: string;
  hits: SearchHit[];
  devices: DeviceResult[];
};
export type SearchResults = { customers: CustomerResult[]; total: number; truncated: boolean };

type CustomerRef = { id: string; name: string };
type DeviceRef = { id: string; name: string; type: DeviceType; customer: CustomerRef };

const customerSelect = { select: { id: true, name: true } } as const;
const deviceSelect = {
  select: { id: true, name: true, type: true, customer: customerSelect },
} as const;

// The first text that holds the term, cut around it. Postgres and JavaScript
// fold case a little differently, so a row with no visible match still shows
// its first text rather than disappearing.
function firstMatch(term: string, candidates: [label: string, text: string][]) {
  const found = candidates.find(([, text]) => contains(text, term)) ?? candidates[0];
  return { label: found[0], text: excerpt(found[1], term) };
}

// A titled record (incident, vulnerability, task): the title says which one,
// and the text shows the match when it is in the body.
function recordHit(kind: string, term: string, title: string, body: string[]): SearchHit {
  const place = `${kind} «${title}»`;
  if (contains(title, term)) return { place, text: "" };
  return { place, text: firstMatch(term, body.map((text) => ["", text])).text };
}

export async function searchEverything(term: string): Promise<SearchResults> {
  const like = { contains: escapeLikePattern(term), mode: "insensitive" as const };
  const types = matchingDeviceTypes(term);
  const take = RESULTS_PER_KIND;

  const [
    customers,
    endUsers,
    devices,
    fields,
    connections,
    incidents,
    vulnerabilities,
    agendaItems,
    attachments,
  ] = await Promise.all([
    db.customer.findMany({
      where: { OR: [{ name: like }, { notes: like }] },
      select: { id: true, name: true, notes: true },
      take,
    }),
    db.endUser.findMany({
      where: {
        OR: [
          { name: like },
          { role: like },
          { contact: like },
          { technicalLevel: like },
          { canTouch: like },
          { notes: like },
        ],
      },
      select: {
        name: true,
        role: true,
        contact: true,
        technicalLevel: true,
        canTouch: true,
        notes: true,
        customer: customerSelect,
      },
      take,
    }),
    db.device.findMany({
      where: {
        OR: [
          { name: like },
          { roles: like },
          { notes: like },
          ...(types.length > 0 ? [{ type: { in: types } }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        roles: true,
        notes: true,
        customer: customerSelect,
      },
      take,
    }),
    db.deviceField.findMany({
      where: { isSecret: false, OR: [{ name: like }, { value: like }] },
      select: { name: true, value: true, device: deviceSelect },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take,
    }),
    db.connection.findMany({
      where: { label: like },
      select: {
        label: true,
        customer: customerSelect,
        source: { select: { name: true } },
        target: { select: { name: true } },
      },
      take,
    }),
    db.incident.findMany({
      where: { OR: [{ title: like }, { description: like }, { resolution: like }] },
      select: { title: true, description: true, resolution: true, device: deviceSelect },
      orderBy: { occurredAt: "desc" },
      take,
    }),
    db.vulnerability.findMany({
      where: { OR: [{ title: like }, { description: like }] },
      select: { title: true, description: true, device: deviceSelect },
      take,
    }),
    db.agendaItem.findMany({
      where: { OR: [{ title: like }, { notes: like }] },
      select: { title: true, notes: true, device: deviceSelect },
      orderBy: { dueAt: "asc" },
      take,
    }),
    db.attachment.findMany({
      where: { OR: [{ title: like }, { fileName: like }] },
      select: { title: true, fileName: true, customer: customerSelect, device: deviceSelect },
      take,
    }),
  ]);

  const byCustomer = new Map<string, CustomerResult>();
  const customerResult = (customer: CustomerRef) => {
    let result = byCustomer.get(customer.id);
    if (!result) {
      result = { id: customer.id, name: customer.name, hits: [], devices: [] };
      byCustomer.set(customer.id, result);
    }
    return result;
  };
  // A match on the name adds the customer or the device with no hit line: the
  // name is already its heading.
  const addToCustomer = (customer: CustomerRef, hit: SearchHit | null) => {
    const result = customerResult(customer);
    if (hit) result.hits.push(hit);
  };
  const addToDevice = (device: DeviceRef, hit: SearchHit | null) => {
    const parent = customerResult(device.customer);
    let result = parent.devices.find((candidate) => candidate.id === device.id);
    if (!result) {
      result = { id: device.id, name: device.name, type: device.type, hits: [] };
      parent.devices.push(result);
    }
    if (hit) result.hits.push(hit);
  };

  for (const customer of customers) {
    const match = firstMatch(term, [
      ["", customer.name],
      ["Notas del cliente", customer.notes],
    ]);
    addToCustomer(customer, match.label ? { place: match.label, text: match.text } : null);
  }
  for (const { customer, name, ...profile } of endUsers) {
    const match = firstMatch(term, [
      ["", name],
      ["Puesto", profile.role],
      ["Contacto", profile.contact],
      ["Nivel técnico", profile.technicalLevel],
      ["Qué puede y qué no puede tocar", profile.canTouch],
      ["Cómo tratarlo", profile.notes],
    ]);
    const place = `Usuario final «${name}»` + (match.label ? ` · ${match.label}` : "");
    addToCustomer(customer, { place, text: match.label ? match.text : "" });
  }
  for (const { customer, source, target, label } of connections) {
    addToCustomer(customer, { place: `Conexión ${source.name} ↔ ${target.name}`, text: label });
  }
  for (const { customer, device, title, fileName } of attachments) {
    const match = firstMatch(term, [
      ["", title],
      ["", fileName],
    ]);
    const hit = { place: "Imagen", text: match.text };
    if (device) addToDevice(device, hit);
    else addToCustomer(customer, hit);
  }

  for (const { customer, ...device } of devices) {
    const match = firstMatch(term, [
      ["", device.name],
      ["Funciones", device.roles],
      ["Notas", device.notes],
      ["Tipo", DEVICE_TYPE_LABELS[device.type]],
    ]);
    addToDevice(
      { ...device, customer },
      match.label ? { place: match.label, text: match.text } : null,
    );
  }
  for (const { device, name, value } of fields) {
    addToDevice(device, { place: `Campo «${name}»`, text: excerpt(value, term) });
  }
  for (const { device, title, description, resolution } of incidents) {
    addToDevice(device, recordHit("Incidente", term, title, [description, resolution]));
  }
  for (const { device, title, description } of vulnerabilities) {
    addToDevice(device, recordHit("Vulnerabilidad", term, title, [description]));
  }
  for (const { device, title, notes } of agendaItems) {
    addToDevice(device, recordHit("Tarea", term, title, [notes]));
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
  const results = [...byCustomer.values()].sort(byName);
  for (const customer of results) customer.devices.sort(byName);

  const lists = [
    customers,
    endUsers,
    devices,
    fields,
    connections,
    incidents,
    vulnerabilities,
    agendaItems,
    attachments,
  ];
  return {
    customers: results,
    total: lists.reduce((sum, list) => sum + list.length, 0),
    truncated: lists.some((list) => list.length === take),
  };
}
