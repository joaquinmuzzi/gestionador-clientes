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
    <div className="mx-auto max-w-[88rem]">
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
      <nav aria-label="Ruta" className="text-sm text-neutral-600">
        <Link href="/" className="hover:text-neutral-900">
          Inicio
        </Link>
        <span className="mx-2 text-neutral-400">/</span>
        <span className="text-neutral-900">{customer.name}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          style={{ background: tint.background, color: tint.ink }}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg font-semibold"
        >
          {initials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold break-words">{customer.name}</h1>
          <p className="text-sm text-neutral-600">
            {devices === 0 ? "Sin dispositivos" : devices === 1 ? "1 dispositivo" : `${devices} dispositivos`}
            {" · "}
            {endUsers.length === 1 ? "1 usuario final" : `${endUsers.length} usuarios finales`}
          </p>
        </div>
        <Link
          href={`/customers/${customer.id}/edit`}
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Editar
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-start gap-5">
        {/* The customer's main screen is its network map. */}
        <section
          aria-label="Mapa de red"
          className="h-[75vh] min-h-[32rem] min-w-0 flex-[999_1_56rem] overflow-hidden rounded-xl border border-neutral-200 bg-white"
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

        <aside className="flex min-w-0 flex-[1_1_20rem] flex-col gap-4">
          {customer.notes && (
            <section className={cardClass}>
              <h2 className="mb-2 text-base font-semibold">
                Notas del cliente
              </h2>
              <p className="text-sm whitespace-pre-wrap text-neutral-800">{customer.notes}</p>
            </section>
          )}
          <div className={cardClass}>
            <EndUsers customerId={customer.id} initial={endUsers} />
          </div>
        </aside>
      </div>

      {/* Images of the customer as a whole (a diagram, a contract, a rack);
          each device's own are on its sheet. */}
      <div className={`mt-5 ${cardClass}`}>
        <AttachmentGallery
          customerId={customer.id}
          initial={attachments}
          heading="Imágenes del cliente"
        />
      </div>
    </>
  );
}

const cardClass = "rounded-xl border border-neutral-200 bg-white p-4";
