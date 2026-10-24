import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DeviceIcon } from "@/components/device-icon";
import { requireUser } from "@/lib/auth/session";
import { DEVICE_TYPE_LABELS } from "@/lib/map/input";
import { SEARCH_MIN_LENGTH, highlight, parseSearchTerm } from "@/lib/search/input";
import { searchEverything, type SearchHit } from "@/lib/search/queries";

export const metadata: Metadata = { title: "Buscar · Gestionador de Clientes" };

// The term is typed in the search box of the header (src/app/(app)/search-box.tsx).
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold">Buscar</h1>
      <Suspense fallback={<p className="mt-4 text-neutral-500">Buscando…</p>}>
        {searchParams.then(({ q }) => (
          <Results raw={typeof q === "string" ? q : ""} />
        ))}
      </Suspense>
    </div>
  );
}

async function Results({ raw }: { raw: string }) {
  await requireUser();
  const term = parseSearchTerm(raw);
  if (!term) {
    return (
      <p className="mt-4 text-neutral-600">
        Escribí al menos {SEARCH_MIN_LENGTH} letras en el buscador de arriba: un nombre, una IP o
        cualquier texto que hayas cargado. Los campos secretos no se buscan.
      </p>
    );
  }

  const { customers, total, truncated } = await searchEverything(term);
  if (customers.length === 0) {
    return <p className="mt-4 text-neutral-600">Nada coincide con «{term}».</p>;
  }

  return (
    <>
      <p className="mt-2 text-sm text-neutral-600" role="status">
        {total === 1 ? "1 resultado" : `${total} resultados`} para «{term}»
        {truncated && ". Hay más: escribí algo más preciso para verlos"}.
      </p>
      <ul className="mt-6 flex flex-col gap-4">
        {customers.map((customer) => (
          <li
            key={customer.id}
            className="rounded-xl border border-neutral-200 bg-white"
            aria-label={customer.name}
          >
            <Link
              href={`/customers/${customer.id}`}
              className="block rounded-t-xl border-b border-neutral-200 px-4 py-3 hover:bg-neutral-50"
            >
              <span className="block font-semibold break-words">
                <Marked text={customer.name} term={term} />
              </span>
              <Hits hits={customer.hits} term={term} />
            </Link>
            {customer.devices.length > 0 && (
              <ul className="divide-y divide-neutral-100">
                {customer.devices.map((device) => (
                  <li key={device.id}>
                    {/* Opens the map centred on the device, with its sheet open. */}
                    <Link
                      href={`/customers/${customer.id}?device=${device.id}`}
                      className="flex gap-3 px-4 py-2.5 hover:bg-neutral-50"
                    >
                      <DeviceIcon
                        type={device.type}
                        className="mt-0.5 size-5 shrink-0 text-neutral-600"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium break-words">
                          <Marked text={device.name} term={term} />
                          <span className="sr-only"> ({DEVICE_TYPE_LABELS[device.type]})</span>
                        </span>
                        <Hits hits={device.hits} term={term} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Hits({ hits, term }: { hits: SearchHit[]; term: string }) {
  if (hits.length === 0) return null;
  return (
    <span className="mt-1 flex flex-col gap-0.5 text-sm">
      {hits.map((hit, index) => (
        <span key={index} className="break-words">
          <span className="text-neutral-500">
            <Marked text={hit.place} term={term} />
          </span>
          {hit.text && (
            <>
              <span className="text-neutral-500">: </span>
              <span className="text-neutral-800">
                <Marked text={hit.text} term={term} />
              </span>
            </>
          )}
        </span>
      ))}
    </span>
  );
}

function Marked({ text, term }: { text: string; term: string }) {
  return highlight(text, term).map((segment, index) =>
    segment.match ? (
      <mark key={index} className="rounded-sm bg-amber-200 px-0.5 text-inherit">
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  );
}
