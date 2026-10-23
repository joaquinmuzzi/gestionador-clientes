import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { SEARCH_MAX_LENGTH } from "@/lib/customers/queries";
import {
  activitySummary,
  describeActivity,
  initials,
  timeAgo,
  tintFor,
} from "@/lib/dashboard/display";
import { getDashboard, type Dashboard } from "@/lib/dashboard/queries";
import { formatDay } from "@/lib/devices/records";
import { DueDay } from "./due-day";

const cardClass = "rounded-xl border border-neutral-200 bg-white";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto flex max-w-[88rem] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Todos los clientes y lo que tenés pendiente con ellos.
          </p>
        </div>
        <Link
          href="/customers/new"
          className="flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
            className="size-4"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo cliente
        </Link>
      </div>
      <Suspense fallback={<p className="text-neutral-500">Cargando…</p>}>
        {searchParams.then(({ q }) => (
          <DashboardView search={typeof q === "string" ? q : ""} />
        ))}
      </Suspense>
    </div>
  );
}

// Data components check the session themselves, close to the data.
async function DashboardView({ search }: { search: string }) {
  await requireUser();
  const dashboard = await getDashboard(search);
  const { totals } = dashboard;
  const now = new Date();

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4">
        <Stat
          label="Clientes"
          value={totals.customers}
          detail={plural(totals.devices, "dispositivo documentado", "dispositivos documentados")}
        />
        <Stat
          label="Incidentes abiertos"
          value={totals.openIncidents}
          warn={totals.openIncidents > 0}
          detail={
            totals.openIncidents > 0
              ? `En ${plural(totals.affectedCustomers, "cliente", "clientes")}`
              : "Nada abierto"
          }
        />
        <Stat
          label="Tareas pendientes"
          value={totals.pendingTasks}
          detail={
            dashboard.upcoming[0] ? (
              <>
                La próxima: <DueDay day={dashboard.upcoming[0].dueAt} />
              </>
            ) : (
              "Nada agendado"
            )
          }
        />
        <Stat
          label="Vulnerabilidades abiertas"
          value={totals.openVulnerabilities}
          warn={totals.urgentVulnerabilities > 0}
          detail={
            totals.urgentVulnerabilities > 0
              ? `${totals.urgentVulnerabilities} de gravedad alta o crítica`
              : "Ninguna alta ni crítica"
          }
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <CustomerCards dashboard={dashboard} search={search} />

        <aside className="flex min-w-0 flex-[1_1_20rem] flex-col gap-4">
          <SidePanel title="Agenda próxima" id="home-agenda">
            {dashboard.upcoming.length === 0 ? (
              <Empty>No hay tareas pendientes.</Empty>
            ) : (
              <ul className="flex flex-col">
                {dashboard.upcoming.map((task) => (
                  <li key={task.id} className="border-t border-neutral-100 first:border-t-0">
                    <DeviceLink device={task.device} className="flex flex-col gap-0.5 py-2.5">
                      <span className="text-sm font-medium text-neutral-900">{task.title}</span>
                      <span className="text-[13px] text-neutral-600">
                        <DueDay day={task.dueAt} /> · {task.device.customer.name} ·{" "}
                        {task.device.name}
                      </span>
                    </DeviceLink>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

          <SidePanel title="Incidentes abiertos" id="home-incidents">
            {dashboard.incidents.length === 0 ? (
              <Empty>No hay incidentes abiertos.</Empty>
            ) : (
              <ul className="flex flex-col gap-1">
                {dashboard.incidents.map((incident) => (
                  <li key={incident.id}>
                    <DeviceLink device={incident.device} className="flex gap-2.5 py-1.5">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-warn"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-neutral-900">
                          {incident.title}
                        </span>
                        <span className="block text-[13px] text-neutral-600">
                          {incident.device.customer.name} · {incident.device.name} ·{" "}
                          {formatDay(incident.occurredAt)}
                        </span>
                      </span>
                    </DeviceLink>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

          <section aria-labelledby="home-activity" className={`${cardClass} px-5 py-4`}>
            <h2 id="home-activity" className="text-base font-semibold">
              Actividad reciente
            </h2>
            {dashboard.activity.length === 0 ? (
              <Empty>Todavía no hay cambios.</Empty>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5 text-[13px] text-neutral-700">
                {dashboard.activity.map((entry) => {
                  const summary = activitySummary(entry.entityType, entry.summary);
                  return (
                    <li key={entry.id}>
                      {describeActivity(entry.action, entry.entityType)}
                      {summary && (
                        <>
                          {": "}
                          <span className="font-medium text-neutral-900">{summary}</span>
                        </>
                      )}{" "}
                      · {timeAgo(entry.createdAt, now)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function CustomerCards({ dashboard, search }: { dashboard: Dashboard; search: string }) {
  const { customers } = dashboard;
  return (
    <section aria-labelledby="home-customers" className="min-w-0 flex-[999_1_36rem]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-customers" className="text-lg font-semibold">
          Clientes
        </h2>
        <form role="search" action="/" className="w-full max-w-xs">
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Filtrar por nombre…"
            aria-label="Buscar clientes"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />
        </form>
      </div>

      {customers.length === 0 ? (
        <p className="text-neutral-600">
          {search ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes cargados."}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3.5">
          {customers.map((customer) => {
            const tint = tintFor(customer.id);
            return (
              <li key={customer.id}>
                <Link
                  href={`/customers/${customer.id}`}
                  className={`${cardClass} flex h-full flex-col gap-3 p-4 hover:border-accent-line hover:shadow-sm`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      style={{ background: tint.background, color: tint.ink }}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
                    >
                      {initials(customer.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{customer.name}</span>
                      {customer.notes && (
                        <span className="block truncate text-[13px] text-neutral-600">
                          {customer.notes.split("\n", 1)[0]}
                        </span>
                      )}
                    </span>
                  </span>

                  <MapThumbnail points={customer.thumbnail} />

                  <span className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-neutral-600">
                    <span>{deviceCount(customer.deviceCount)}</span>
                    {customer.openIncidents > 0 ? (
                      <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn-ink">
                        {plural(customer.openIncidents, "incidente abierto", "incidentes abiertos")}
                      </span>
                    ) : customer.deviceCount > 0 ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">
                        Al día
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// The shape of the customer's map, one dot per device, as a hint of its size.
function MapThumbnail({ points }: { points: Dashboard["customers"][number]["thumbnail"] }) {
  return (
    <span
      aria-hidden="true"
      className="relative block h-16 overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50 bg-[radial-gradient(#dce0e6_1px,transparent_1px)] bg-[size:10px_10px]"
    >
      {points.map((point, index) => (
        <span
          key={index}
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-accent/70"
        />
      ))}
    </span>
  );
}

function Stat({
  label,
  value,
  detail,
  warn = false,
}: {
  label: string;
  value: number;
  detail: ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={`${cardClass} px-5 py-4`}>
      <p className="text-[13px] text-neutral-600">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${warn ? "text-warn-ink" : ""}`}>{value}</p>
      <p className="mt-0.5 text-[13px] text-neutral-600">{detail}</p>
    </div>
  );
}

function SidePanel({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${cardClass} px-5 py-4`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        <Link href="/agenda" className="text-[13px] text-accent hover:text-accent-strong">
          Ver todo
        </Link>
      </div>
      {children}
    </section>
  );
}

// Opens the customer's map centred on the device, with its sheet open.
function DeviceLink({
  device,
  className,
  children,
}: {
  device: Dashboard["upcoming"][number]["device"];
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/customers/${device.customer.id}?device=${device.id}`}
      className={`${className} rounded-md hover:bg-neutral-50`}
    >
      {children}
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-neutral-600">{children}</p>;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function deviceCount(count: number): string {
  if (count === 0) return "Sin dispositivos";
  return plural(count, "dispositivo", "dispositivos");
}
