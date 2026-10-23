import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { logout } from "./actions";
import { SearchBox, SearchBoxFallback } from "./search-box";

// Everything inside (app) needs a logged-in user. Each page still calls
// requireUser() itself: layouts don't re-render on every navigation.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-navy px-6 py-2.5 text-navy-text">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 font-semibold text-white">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-4"
            >
              <circle cx="5" cy="6" r="2.5" />
              <circle cx="19" cy="6" r="2.5" />
              <circle cx="12" cy="18" r="2.5" />
              <path d="M7 7.5l3.5 8.5M17 7.5l-3.5 8.5M7.5 6h9" />
            </svg>
          </span>
          Gestionador de Clientes
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-navy-soft hover:text-white">
            Inicio
          </Link>
          <Link
            href="/agenda"
            className="rounded-md px-3 py-1.5 hover:bg-navy-soft hover:text-white"
          >
            Incidentes y agenda
          </Link>
        </nav>
        <div className="ml-auto flex min-w-0 flex-1 basis-64 justify-end">
          <Suspense fallback={<SearchBoxFallback />}>
            <SearchBox />
          </Suspense>
        </div>
        <Suspense>
          <UserMenu />
        </Suspense>
      </header>
      <main className="flex-1 px-6 py-6">{children}</main>
    </>
  );
}

async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex shrink-0 items-center gap-3 text-sm">
      <span className="flex items-center gap-1.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-3.5 text-navy-muted"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        {user.email}
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-navy-line px-3 py-1 hover:bg-navy-soft hover:text-white"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
