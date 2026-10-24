"use client";

import Form from "next/form";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { SEARCH_MAX_LENGTH } from "@/lib/search/input";

// A plain box in the toolbar.
const inputClass =
  "h-7 w-full rounded-sm border border-chrome-line bg-white px-2 text-[13px] text-neutral-900 " +
  "placeholder:text-neutral-500 focus:border-select-line focus:outline-none focus:ring-1 " +
  "focus:ring-select-line";

const placeholder = "Buscar en todos los clientes: nombre, IP, campo… (Ctrl+K)";

// The global search, on every page. Ctrl+K (⌘K on a Mac) jumps to it from
// anywhere, the map included. It reads the URL, so the layout renders it inside
// <Suspense> with SearchBoxFallback.
export function SearchBox() {
  const input = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/search" ? (params.get("q") ?? "") : "";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Form action="/search" role="search" className="w-full max-w-md">
      <input
        // A new search in the URL replaces what the box shows.
        key={current}
        ref={input}
        type="search"
        name="q"
        defaultValue={current}
        maxLength={SEARCH_MAX_LENGTH}
        placeholder={placeholder}
        aria-label="Buscar en todos los clientes"
        aria-keyshortcuts="Control+K Meta+K"
        className={inputClass}
      />
    </Form>
  );
}

export function SearchBoxFallback() {
  return (
    <div className="w-full max-w-md">
      <input type="search" disabled placeholder={placeholder} className={inputClass} />
    </div>
  );
}
