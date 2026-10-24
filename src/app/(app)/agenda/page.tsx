import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { getAgendaOverview, type IncidentFilter } from "@/lib/dashboard/queries";
import { formatDay } from "@/lib/devices/records";
import { WeekAgenda } from "./week-agenda";

export const metadata: Metadata = { title: "Incidentes y agenda · Gestionador de Clientes" };

// The filter is in the URL, in Spanish like the rest of what the user sees.
const FILTERS: { param: string; filter: IncidentFilter; label: string }[] = [
  { param: "abiertos", filter: "open", label: "Abiertos" },
  { param: "resueltos", filter: "closed", label: "Resueltos" },
  { param: "todos", filter: "all", label: "Todos" },
];

// Everything pending with every customer in one place: the tasks of the week
// and the incidents. Records are edited on the device sheet; every row leads there.
export default function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  return (
    <div className="mx-auto flex max-w-[88rem] flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Incidentes y agenda</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Todo lo pendiente de todos los clientes. Para cargar o cambiar algo, abrí la ficha del
          dispositivo.
        </p>
      </div>
      <Suspense fallback={<p className="text-neutral-500">Cargando…</p>}>
        {searchParams.then(({ estado }) => (
          <Overview
            filter={FILTERS.find((option) => option.param === estado) ?? FILTERS[0]}
          />
        ))}
      </Suspense>
    </div>
  );
}

async function Overview({ filter }: { filter: (typeof FILTERS)[number] }) {
  await requireUser();
  const { tasks, incidents, openCount } = await getAgendaOverview(filter.filter);

  return (
    <>
      <WeekAgenda tasks={tasks} />

      <section
        aria-labelledby="agenda-incidents"
        className="overflow-hidden rounded-sm border border-neutral-300 bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-3.5 py-2">
          <h2 id="agenda-incidents" className="font-semibold">
            Incidentes
          </h2>
          <nav aria-label="Filtrar incidentes" className="flex">
            {FILTERS.map((option) => {
              const current = option.param === filter.param;
              return (
                <Link
                  key={option.param}
                  href={`/agenda?estado=${option.param}`}
                  aria-current={current ? "page" : undefined}
                  className={
                    "-ml-px border px-3 py-0.5 text-[13px] first:ml-0 first:rounded-l-sm last:rounded-r-sm " +
                    (current
                      ? "relative border-select-line bg-select text-neutral-900"
                      : "border-neutral-300 bg-white hover:bg-neutral-100")
                  }
                >
                  {option.label}
                  {option.filter === "open" && ` (${openCount})`}
                </Link>
              );
            })}
          </nav>
        </div>

        {incidents.length === 0 ? (
          <p className="px-5 py-4 text-sm text-neutral-600">
            {filter.filter === "open" ? "No hay incidentes abiertos." : "No hay incidentes."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-neutral-600 uppercase">
                  <th scope="col" className="px-5 py-2.5 font-medium">Estado</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Qué pasó</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Cliente</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Dispositivo</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Fecha</th>
                  <th scope="col" className="py-2.5 pr-5 pl-3 font-medium">Cómo se resolvió</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id} className="border-t border-neutral-100 align-top">
                    <td className="px-5 py-3">
                      <span
                        className={
                          "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap " +
                          (incident.closed
                            ? "bg-neutral-100 text-neutral-700"
                            : "bg-warn-soft text-warn-ink")
                        }
                      >
                        {incident.closed ? "Resuelto" : "Abierto"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium break-words">{incident.title}</td>
                    <td className="px-3 py-3 text-neutral-800">
                      <Link
                        href={`/customers/${incident.device.customer.id}`}
                        className="hover:text-accent"
                      >
                        {incident.device.customer.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/customers/${incident.device.customer.id}?device=${incident.device.id}`}
                        className="font-mono text-[13px] text-accent hover:text-accent-strong"
                      >
                        {incident.device.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-neutral-600">
                      {formatDay(incident.occurredAt)}
                    </td>
                    <td className="py-3 pr-5 pl-3 text-[13px] whitespace-pre-line text-neutral-700">
                      {incident.resolution || (incident.closed ? "" : "Pendiente.")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
