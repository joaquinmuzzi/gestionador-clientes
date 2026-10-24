import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/auth/session";
import { logout } from "./actions";
import { Explorer } from "./explorer";
import { SearchBox, SearchBoxFallback } from "./search-box";

// Everything inside (app) needs a logged-in user. Each page still calls
// requireUser() itself: layouts don't re-render on every navigation.
// The frame of a Windows administration console: a menu bar, a toolbar, the
// tree of customers on the left and the page in a white pane.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header>
        <div className="flex h-8 items-center gap-1 border-b border-chrome-line bg-chrome-light px-2">
          <Link
            href="/"
            className="mr-3 flex shrink-0 items-center gap-1.5 px-1 font-bold text-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              aria-hidden="true"
              className="size-4"
            >
              <rect x="3" y="3" width="6" height="5" />
              <rect x="15" y="3" width="6" height="5" />
              <rect x="9" y="16" width="6" height="5" />
              <path d="M6 8v4h12V8M12 12v4" />
            </svg>
            Gestionador de Clientes
          </Link>
          <nav aria-label="Principal" className="flex items-center text-[13px]">
            <MenuLink href="/">Inicio</MenuLink>
            <MenuLink href="/agenda">Incidentes y agenda</MenuLink>
          </nav>
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-chrome-line bg-chrome px-2 py-1.5">
          <ToolLink href="/customers/new" label="Nuevo cliente">
            <path d="M12 5v14M5 12h14" />
          </ToolLink>
          <div className="ml-auto flex min-w-0 flex-1 basis-64 justify-end">
            <Suspense fallback={<SearchBoxFallback />}>
              <SearchBox />
            </Suspense>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-chrome-line bg-white md:block">
          <div className="sticky top-0 max-h-screen overflow-y-auto">
            <Suspense>
              <Explorer />
            </Suspense>
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-white px-5 py-4">{children}</main>
      </div>

      <footer className="flex h-6 items-center gap-0 border-t border-chrome-line bg-chrome-light text-xs text-neutral-600">
        <span className="border-r border-neutral-200 px-3">
          Doble clic en un dispositivo para abrir su ficha
        </span>
        <span className="border-r border-neutral-200 px-3">Ctrl+K para buscar en todo</span>
        <span className="ml-auto px-3">Los campos secretos se guardan cifrados</span>
      </footer>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-sm px-2 py-0.5 hover:bg-select">
      {children}
    </Link>
  );
}

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      {children}
    </svg>
  );
}

function ToolLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-sm border border-transparent px-2 py-1 text-[13px] hover:border-select-line hover:bg-select [&>svg]:text-accent"
    >
      <ToolIcon>{children}</ToolIcon>
      {label}
    </Link>
  );
}

async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-neutral-600">
      <span className="flex items-center gap-1">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-3"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        {user.email}
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-sm border border-chrome-line bg-white px-2 py-0.5 text-neutral-800 hover:bg-select"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
