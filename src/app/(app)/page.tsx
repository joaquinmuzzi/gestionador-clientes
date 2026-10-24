import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { SEARCH_MAX_LENGTH } from "@/lib/customers/queries";
import {
  activitySummary,
  describeActivity,
  timeAgo,
} from "@/lib/dashboard/display";
import { getDashboard, type Dashboard } from "@/lib/dashboard/queries";
import { formatDay } from "@/lib/devices/records";
import { DueDay } from "./due-day";

const cardClass = "rounded-sm border border-neutral-300 bg-white";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Inicio</h1>
        <p className="text-neutral-600">Todos los clientes y lo que tenés pendiente con ellos.</p>
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3.5 pt-2">
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

      <CustomerList dashboard={dashboard} search={search} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] items-start gap-4">
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

          <section aria-labelledby="home-activity" className={`${cardClass} px-3.5 py-2.5`}>
            <h2 id="home-activity" className="font-semibold">
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
      </div>
    </>
  );
}

// The customers as the details view of a file explorer: one row per customer,
// the whole row a link to its map.
function CustomerList({ dashboard, search }: { dashboard: Dashboard; search: string }) {
  const { customers } = dashboard;
  const columns = "grid grid-cols-[minmax(12rem,2fr)_minmax(0,2fr)_8rem_10rem] gap-x-3";
  return (
    <section aria-labelledby="home-customers" className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="home-customers" className="font-semibold">
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
            className="h-7 w-full rounded-sm border border-neutral-300 bg-white px-2 text-[13px] focus:border-select-line focus:ring-1 focus:ring-select-line focus:outline-none"
          />
        </form>
      </div>

      {customers.length === 0 ? (
        <p className="text-neutral-600">
          {search ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes cargados."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-neutral-300">
          <div className="min-w-[44rem]">
            <div
              aria-hidden="true"
              className={`${columns} border-b border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600`}
            >
              <span>Nombre ▴</span>
              <span>Notas</span>
              <span>Dispositivos</span>
              <span>Estado</span>
            </div>
            <ul>
              {customers.map((customer) => (
                <li key={customer.id} className="border-b border-neutral-100 last:border-b-0">
                  <Link
                    href={`/customers/${customer.id}`}
                    className={`${columns} items-center px-2.5 py-1 hover:bg-select`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`size-[7px] shrink-0 rounded-full ${customer.openIncidents > 0 ? "bg-warn" : "bg-[#2e9e5b]"}`}
                      />
                      <span className="truncate font-semibold">{customer.name}</span>
                    </span>
                    <span className="truncate text-neutral-600">
                      {customer.notes?.split("\n", 1)[0]}
                    </span>
                    <span className="tabular-nums">{deviceCount(customer.deviceCount)}</span>
                    {customer.openIncidents > 0 ? (
                      <span className="text-warn-ink">
                        {plural(customer.openIncidents, "incidente abierto", "incidentes abiertos")}
                      </span>
                    ) : customer.deviceCount > 0 ? (
                      <span className="text-neutral-700">✓ Al día</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
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
    // A group box: the label sits on the border, as in a Windows dialog.
    <div className="relative rounded-sm border border-neutral-300 px-3.5 pt-3 pb-2.5">
      <p className="absolute -top-2.5 left-2.5 bg-white px-1.5 text-xs text-neutral-600">{label}</p>
      <p className={`text-[26px] leading-tight font-semibold ${warn ? "text-warn-ink" : ""}`}>
        {value}
      </p>
      <p className="text-[13px] text-neutral-600">{detail}</p>
    </div>
  );
}

function SidePanel({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${cardClass} px-3.5 py-2.5`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <Link href="/agenda" className="text-[13px] text-link underline">
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
      className={`${className} rounded-sm hover:bg-select`}
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
