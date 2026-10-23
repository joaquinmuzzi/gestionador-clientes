import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCustomerAttachments } from "@/lib/attachments/queries";
import { requireUser } from "@/lib/auth/session";
import { getCustomer } from "@/lib/customers/queries";
import { getEndUsers } from "@/lib/end-users/queries";
import { getCustomerMap } from "@/lib/map/queries";
import { AttachmentGallery } from "./attachment-gallery";
import { EndUsers } from "./end-users";
import { MapEditor } from "./map-editor";

export const metadata: Metadata = { title: "Cliente · Gestionador de Clientes" };

// The id is only known at request time, so everything that reads it sits
// inside <Suspense> (Cache Components).
export default function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-900">
        ← Clientes
      </Link>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Cargando…</p>}>
        {params.then(({ id }) => (
          <CustomerDetails id={id} />
        ))}
      </Suspense>
    </div>
  );
}

async function CustomerDetails({ id }: { id: string }) {
  await requireUser();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const [map, attachments, endUsers] = await Promise.all([
    getCustomerMap(customer.id),
    getCustomerAttachments(customer.id),
    getEndUsers(customer.id),
  ]);

  return (
    <>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold break-words">{customer.name}</h1>
        <Link
          href={`/customers/${customer.id}/edit`}
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100"
        >
          Editar
        </Link>
      </div>
      {customer.notes && (
        <p className="mt-3 whitespace-pre-wrap text-neutral-700">{customer.notes}</p>
      )}

      {/* The customer's main screen is its network map. */}
      <section
        aria-label="Mapa de red"
        className="mt-6 h-[70vh] min-h-[28rem] overflow-hidden rounded-xl border border-neutral-200 bg-white"
      >
        <MapEditor customerId={customer.id} map={map} />
      </section>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <EndUsers customerId={customer.id} initial={endUsers} />
      </div>

      {/* Images of the customer as a whole (a diagram, a contract, a rack);
          each device's own are on its sheet. */}
      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
        <AttachmentGallery
          customerId={customer.id}
          initial={attachments}
          heading="Imágenes del cliente"
        />
      </div>
    </>
  );
}
