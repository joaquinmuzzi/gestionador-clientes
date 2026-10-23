import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { SEARCH_MAX_LENGTH, listCustomers } from "@/lib/customers/queries";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Link
          href="/customers/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Nuevo cliente
        </Link>
      </div>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Cargando…</p>}>
        {searchParams.then(({ q }) => (
          <CustomerList search={typeof q === "string" ? q : ""} />
        ))}
      </Suspense>
    </div>
  );
}

// Data components check the session themselves, close to the data.
async function CustomerList({ search }: { search: string }) {
  await requireUser();
  const customers = await listCustomers(search);

  return (
    <>
      <form role="search" action="/" className="mt-6">
        <input
          type="search"
          name="q"
          defaultValue={search}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Buscar por nombre…"
          aria-label="Buscar clientes"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </form>

      {customers.length === 0 ? (
        <p className="mt-6 text-neutral-600">
          {search ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes cargados."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/customers/${customer.id}`}
                className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className="block font-medium break-words">{customer.name}</span>
                  {customer.notes && (
                    <span className="block truncate text-sm text-neutral-600">
                      {customer.notes.split("\n", 1)[0]}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-neutral-500">
                  {deviceCount(customer._count.devices)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function deviceCount(count: number): string {
  if (count === 0) return "Sin dispositivos";
  return count === 1 ? "1 dispositivo" : `${count} dispositivos`;
}
