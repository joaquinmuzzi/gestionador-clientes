import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCustomerAttachments } from "@/lib/attachments/queries";
import { requireUser } from "@/lib/auth/session";
import { getCustomer } from "@/lib/customers/queries";
import { initials, tintFor } from "@/lib/dashboard/display";
import { getEndUsers } from "@/lib/end-users/queries";
import { getCustomerMap } from "@/lib/map/queries";
import { AttachmentGallery } from "./attachment-gallery";
import { EndUsers } from "./end-users";
import { MapEditor } from "./map-editor";

export const metadata: Metadata = { title: "Cliente · Gestionador de Clientes" };

// The id is only known at request time, so everything that reads it sits
// inside <Suspense> (Cache Components). `?device=<id>`, from the search,
// centres the map on that device and opens its sheet.
export default function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  return (
    <div>
      <Suspense fallback={<p className="text-neutral-500">Cargando…</p>}>
        {Promise.all([params, searchParams]).then(([{ id }, { device }]) => (
          <CustomerDetails id={id} deviceId={typeof device === "string" ? device : null} />
        ))}
      </Suspense>
    </div>
  );
}

async function CustomerDetails({ id, deviceId }: { id: string; deviceId: string | null }) {
  await requireUser();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const [map, attachments, endUsers] = await Promise.all([
    getCustomerMap(customer.id),
    getCustomerAttachments(customer.id),
    getEndUsers(customer.id),
  ]);
  // Only a device of this map; anything else in the URL is ignored.
  const focusDeviceId = map.devices.some((device) => device.id === deviceId) ? deviceId : null;
  const tint = tintFor(customer.id);
  const devices = map.devices.length;

  return (
    <>
      <nav aria-label="Ruta" className="text-[13px] text-neutral-600">
        <Link href="/" className="text-link hover:underline">
          Inicio
        </Link>
        <span className="mx-1.5 text-neutral-400">›</span>
        <span className="text-neutral-900">{customer.name}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          style={{ background: tint.background, color: tint.ink }}
          className="flex size-9 shrink-0 items-center justify-center rounded-sm text-sm font-semibold"
        >
          {initials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-tight font-semibold break-words">{customer.name}</h1>
          <p className="text-[13px] text-neutral-600">
            {devices === 0 ? "Sin dispositivos" : devices === 1 ? "1 dispositivo" : `${devices} dispositivos`}
            {" · "}
            {endUsers.length === 1 ? "1 usuario final" : `${endUsers.length} usuarios finales`}
          </p>
        </div>
        <Link
          href={`/customers/${customer.id}/edit`}
          className="shrink-0 rounded-sm border border-neutral-300 bg-linear-to-b from-white to-neutral-100 px-3 py-1 text-[13px] hover:border-select-line hover:from-select hover:to-select"
        >
          Editar
        </Link>
      </div>

      {/* The customer's main screen is its network map, across the whole pane;
          the device sheet docks at its bottom, like a properties pane. */}
      <section
        aria-label="Mapa de red"
        className="mt-3 h-[calc(100vh-12rem)] min-h-[34rem] overflow-hidden rounded-sm border border-neutral-300 bg-white"
      >
          {/* Keyed, so a search that leads to another device of the same customer
              centres the map again. */}
        <MapEditor
          key={focusDeviceId ?? ""}
          customerId={customer.id}
          map={map}
          focusDeviceId={focusDeviceId}
        />
      </section>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(22rem,1fr))] items-start gap-4">
        {customer.notes && (
          <section className={cardClass}>
            <h2 className="mb-1.5 font-semibold">Notas del cliente</h2>
            <p className="text-sm whitespace-pre-wrap text-neutral-800">{customer.notes}</p>
          </section>
        )}
        <div className={cardClass}>
          <EndUsers customerId={customer.id} initial={endUsers} />
        </div>
      </div>

      {/* Images of the customer as a whole (a diagram, a contract, a rack);
          each device's own are on its sheet. */}
      <div className={`mt-4 ${cardClass}`}>
        <AttachmentGallery
          customerId={customer.id}
          initial={attachments}
          heading="Imágenes del cliente"
        />
      </div>
    </>
  );
}

const cardClass = "rounded-sm border border-neutral-300 bg-white p-3.5";
