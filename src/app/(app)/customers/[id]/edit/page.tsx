import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { getCustomer } from "@/lib/customers/queries";
import { deleteCustomer, updateCustomer } from "../../actions";
import { CustomerForm } from "../../customer-form";
import { DeleteCustomerForm } from "./delete-customer-form";

export const metadata: Metadata = { title: "Editar cliente · Gestionador de Clientes" };

export default function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<p className="text-neutral-500">Cargando…</p>}>
        {params.then(({ id }) => (
          <EditCustomer id={id} />
        ))}
      </Suspense>
    </div>
  );
}

async function EditCustomer({ id }: { id: string }) {
  await requireUser();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const customerHref = `/customers/${customer.id}`;

  return (
    <>
      <Link href={customerHref} className="text-sm text-neutral-600 hover:text-neutral-900">
        ← {customer.name}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Editar cliente</h1>
      <CustomerForm
        action={updateCustomer.bind(null, customer.id)}
        initial={{ name: customer.name, notes: customer.notes }}
        submitLabel="Guardar cambios"
        cancelHref={customerHref}
      />

      <section className="mt-12 rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-red-800">Borrar el cliente</h2>
        <p className="mt-1 mb-4 text-sm text-neutral-700">
          Se borra el cliente con su mapa, sus dispositivos, sus usuarios finales y todo lo que
          tengan cargado. No se puede deshacer.
        </p>
        <DeleteCustomerForm
          customerName={customer.name}
          action={deleteCustomer.bind(null, customer.id)}
        />
      </section>
    </>
  );
}
