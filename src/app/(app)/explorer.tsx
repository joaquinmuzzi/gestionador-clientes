"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DeviceIcon, deviceTint } from "@/components/device-icon";
import type { ExplorerTree } from "@/lib/customers/queries";

// The tree on the left, as in a Windows administration console: every
// customer, and under the one on screen its devices. A device opens its sheet
// on the customer's map.

// Sent by the autosave after every change, so a device added or renamed on the
// map shows up here without reloading.
export const EXPLORER_REFRESH_EVENT = "explorer-refresh";

export function Explorer() {
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = /^\/customers\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null;
  const deviceId = openId ? params.get("device") : null;
  const [tree, setTree] = useState<ExplorerTree | null>(null);

  useEffect(() => {
    let stale = false;
    const load = () => {
      fetch(`/explorer${openId ? `?customer=${openId}` : ""}`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<ExplorerTree>) : null))
        .then((next) => {
          if (!stale && next) setTree(next);
        })
        // The tree is a shortcut; the page itself still works without it.
        .catch(() => {});
    };
    load();
    window.addEventListener(EXPLORER_REFRESH_EVENT, load);
    return () => {
      stale = true;
      window.removeEventListener(EXPLORER_REFRESH_EVENT, load);
    };
    // A new page (another customer, a new one, an edit) may change the tree.
  }, [openId, pathname]);

  return (
    <nav aria-label="Clientes y dispositivos" className="py-1 text-[13px]">
      <ul role="tree" aria-label="Clientes y dispositivos">
        <li role="none">
          <TreeLink href="/" level={0} selected={pathname === "/"} expanded>
            <FolderIcon />
            <span className="font-semibold">Clientes</span>
            {tree && <Count>{tree.customers.length}</Count>}
          </TreeLink>
          <ul role="group">
            {!tree && <li className="py-1 pl-9 text-neutral-500">Cargando…</li>}
            {tree?.customers.map((customer) => {
              const open = customer.id === tree.openCustomerId;
              return (
                <li role="none" key={customer.id}>
                  <TreeLink
                    href={`/customers/${customer.id}`}
                    level={1}
                    selected={open && !deviceId && pathname === `/customers/${customer.id}`}
                    expanded={open}
                  >
                    <span
                      aria-hidden="true"
                      title={customer.hasOpenIncidents ? "Tiene incidentes abiertos" : undefined}
                      className={`size-[7px] shrink-0 rounded-full ${customer.hasOpenIncidents ? "bg-warn" : "bg-[#2e9e5b]"}`}
                    />
                    <span className="truncate">{customer.name}</span>
                    <Count>{customer.deviceCount}</Count>
                  </TreeLink>
                  {open && (
                    <ul role="group">
                      <li role="none">
                        <div className="flex h-[22px] items-center gap-1.5 pr-2 pl-[38px] text-neutral-600">
                          <span aria-hidden="true" className="w-3 text-center text-[9px]">
                            ▾
                          </span>
                          <FolderIcon />
                          Dispositivos
                          <Count>{tree.devices.length}</Count>
                        </div>
                        <ul role="group">
                          {tree.devices.length === 0 && (
                            <li className="py-0.5 pl-[70px] text-neutral-500">Todavía no hay.</li>
                          )}
                          {tree.devices.map((device) => (
                            <li role="none" key={device.id}>
                              <TreeLink
                                href={`/customers/${customer.id}?device=${device.id}`}
                                level={3}
                                selected={device.id === deviceId}
                              >
                                <span
                                  style={{ color: deviceTint(device.type).ink }}
                                  className="inline-grid"
                                >
                                  <DeviceIcon type={device.type} className="size-[15px] shrink-0" />
                                </span>
                                <span className="truncate">{device.name}</span>
                              </TreeLink>
                            </li>
                          ))}
                        </ul>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
    </nav>
  );
}

// A link in the tree. Its role is treeitem, so it reads as part of the tree
// and not as one more link on the page.
function TreeLink({
  href,
  level,
  selected,
  expanded,
  children,
}: {
  href: string;
  level: number;
  selected: boolean;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={expanded}
      style={{ paddingLeft: 6 + level * 16 }}
      className={
        "flex h-[22px] items-center gap-1.5 pr-2 whitespace-nowrap outline-offset-[-1px] " +
        (selected
          ? "bg-select outline outline-1 outline-select-line"
          : "hover:bg-neutral-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-select-line")
      }
    >
      <span aria-hidden="true" className="w-3 shrink-0 text-center text-[9px] text-neutral-500">
        {expanded === undefined ? "" : expanded ? "▾" : "▸"}
      </span>
      {children}
    </Link>
  );
}

function Count({ children }: { children: ReactNode }) {
  return <span className="ml-auto pl-2 text-xs text-neutral-500 tabular-nums">{children}</span>;
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0">
      <path
        d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"
        fill="#e8b84a"
        stroke="#c99a2e"
      />
    </svg>
  );
}
