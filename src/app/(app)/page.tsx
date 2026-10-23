import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Clientes</h1>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Cargando…</p>}>
        <ClientList />
      </Suspense>
    </div>
  );
}

// Placeholder until clients exist. Data components check the session
// themselves, close to the data.
async function ClientList() {
  await requireUser();
  return <p className="mt-4 text-neutral-600">Todavía no hay clientes cargados.</p>;
}
