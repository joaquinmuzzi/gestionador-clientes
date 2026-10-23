import Link from "next/link";

// Unknown URLs and missing records (notFound()), in Spanish like the rest of
// the interface. A notFound() inside <Suspense> keeps the 200 status, because
// the page had already started streaming.
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">No encontramos lo que buscabas</h1>
      <p className="mt-2 text-neutral-600">Puede que se haya borrado o que el enlace esté mal.</p>
      <Link
        href="/"
        className="mt-6 rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
      >
        Volver a los clientes
      </Link>
    </div>
  );
}
