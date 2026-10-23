import { db } from "@/lib/db";
import { toDay } from "@/lib/devices/records";
import { escapeLikePattern, SEARCH_MAX_LENGTH } from "@/lib/customers/queries";
import { collapseSpaces } from "@/lib/customers/input";

// Reads across every customer for the home page and for "Incidentes y
// agenda". None of them selects a field, so no secret can leave the server
// here. Callers check the session first (requireUser).

const deviceRef = {
  select: {
    id: true,
    name: true,
    type: true,
    customer: { select: { id: true, name: true } },
  },
} as const;

// The home page: every customer as a card (with a thumbnail of its map),
// what is pending and the latest changes.
export async function getDashboard(search: string) {
  const term = collapseSpaces(search).slice(0, SEARCH_MAX_LENGTH);
  const [
    customers,
    customerCount,
    deviceCount,
    openIncidents,
    pendingTasks,
    openVulnerabilities,
    urgentVulnerabilities,
    upcoming,
    incidents,
    activity,
  ] = await Promise.all([
    db.customer.findMany({
      where: term
        ? { name: { contains: escapeLikePattern(term), mode: "insensitive" } }
        : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        notes: true,
        updatedAt: true,
        devices: { select: { positionX: true, positionY: true, type: true } },
      },
    }),
    db.customer.count(),
    db.device.count(),
    db.incident.findMany({
      where: { resolvedAt: null },
      select: { device: { select: { customerId: true } } },
    }),
    db.agendaItem.count({ where: { doneAt: null } }),
    db.vulnerability.count({ where: { resolvedAt: null } }),
    db.vulnerability.count({
      where: { resolvedAt: null, severity: { in: ["HIGH", "CRITICAL"] } },
    }),
    db.agendaItem.findMany({
      where: { doneAt: null },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 5,
      select: { id: true, title: true, dueAt: true, device: deviceRef },
    }),
    db.incident.findMany({
      where: { resolvedAt: null },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, title: true, occurredAt: true, device: deviceRef },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, action: true, entityType: true, summary: true, createdAt: true },
    }),
  ]);

  const openByCustomer = new Map<string, number>();
  for (const { device } of openIncidents) {
    openByCustomer.set(device.customerId, (openByCustomer.get(device.customerId) ?? 0) + 1);
  }

  return {
    totals: {
      customers: customerCount,
      devices: deviceCount,
      openIncidents: openIncidents.length,
      affectedCustomers: openByCustomer.size,
      pendingTasks,
      openVulnerabilities,
      urgentVulnerabilities,
    },
    customers: customers.map(({ devices, ...customer }) => ({
      ...customer,
      deviceCount: devices.length,
      openIncidents: openByCustomer.get(customer.id) ?? 0,
      thumbnail: thumbnail(devices),
    })),
    upcoming: upcoming.map(({ dueAt, ...item }) => ({ ...item, dueAt: toDay(dueAt) })),
    incidents: incidents.map(({ occurredAt, ...incident }) => ({
      ...incident,
      occurredAt: toDay(occurredAt),
    })),
    activity,
  };
}

// Where each device sits on the map, as percentages of a small box, so the
// card shows the shape of the customer's network. Capped, to keep the page light.
const THUMBNAIL_MAX = 40;

function thumbnail(devices: { positionX: number; positionY: number; type: string }[]) {
  const shown = devices.slice(0, THUMBNAIL_MAX);
  if (shown.length === 0) return [];
  const xs = shown.map((device) => device.positionX);
  const ys = shown.map((device) => device.positionY);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = (value: number, min: number, max: number) =>
    max === min ? 50 : 15 + ((value - min) / (max - min)) * 70;
  return shown.map((device) => ({
    x: scale(device.positionX, minX, maxX),
    y: scale(device.positionY, minY, maxY),
    type: device.type,
  }));
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

export const INCIDENT_FILTERS = ["open", "closed", "all"] as const;
export type IncidentFilter = (typeof INCIDENT_FILTERS)[number];

// More than a screen; older ones are found with the search.
const INCIDENTS_MAX = 200;
const TASKS_MAX = 500;

// "Incidentes y agenda": every pending task (the page lays them out on the
// week, in the technician's time zone) and the incidents of every customer.
export async function getAgendaOverview(filter: IncidentFilter) {
  const resolvedAt = filter === "open" ? null : filter === "closed" ? { not: null } : undefined;
  const [tasks, incidents, openCount] = await Promise.all([
    db.agendaItem.findMany({
      where: { doneAt: null },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: TASKS_MAX,
      select: { id: true, title: true, dueAt: true, device: deviceRef },
    }),
    db.incident.findMany({
      where: { resolvedAt },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: INCIDENTS_MAX,
      select: {
        id: true,
        title: true,
        occurredAt: true,
        resolution: true,
        resolvedAt: true,
        device: deviceRef,
      },
    }),
    db.incident.count({ where: { resolvedAt: null } }),
  ]);
  return {
    tasks: tasks.map(({ dueAt, ...task }) => ({ ...task, dueAt: toDay(dueAt) })),
    incidents: incidents.map(({ occurredAt, resolvedAt, ...incident }) => ({
      ...incident,
      occurredAt: toDay(occurredAt),
      closed: resolvedAt !== null,
    })),
    openCount,
  };
}

export type AgendaTask = Awaited<ReturnType<typeof getAgendaOverview>>["tasks"][number];
