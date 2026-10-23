import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { getCustomer } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Cliente · Gestionador de Clientes" };

// The id is only known at request time, so everything that reads it sits
// inside <Suspense> (Cache Components).
export default function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <div className="mx-auto max-w-5xl">
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

      {/* The customer's main screen is its network map; the map editor goes here. */}
      <section
        aria-label="Mapa de red"
        className="mt-6 flex h-96 items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-white text-neutral-500"
      >
        Acá va a estar el mapa de red del cliente.
      </section>
    </>
  );
}
