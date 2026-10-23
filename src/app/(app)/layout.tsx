import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { logout } from "./actions";
import { SearchBox, SearchBoxFallback } from "./search-box";

// Everything inside (app) needs a logged-in user. Each page still calls
// requireUser() itself: layouts don't re-render on every navigation.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="flex items-center justify-between gap-6 border-b border-neutral-200 bg-white px-6 py-3">
        <span className="shrink-0 font-semibold">Gestionador de Clientes</span>
        <Suspense fallback={<SearchBoxFallback />}>
          <SearchBox />
        </Suspense>
        <Suspense>
          <UserMenu />
        </Suspense>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </>
  );
}

async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex shrink-0 items-center gap-4 text-sm">
      <span className="text-neutral-600">{user.email}</span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
