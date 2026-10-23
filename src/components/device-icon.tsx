import type { ReactNode } from "react";
import type { DeviceType } from "@/lib/map/input";

// One line icon per device type, drawn on a 24×24 grid with the current text
// colour, so the map, the palette and later the device sheet look the same.
const PATHS: Record<DeviceType, ReactNode> = {
  ROUTER: (
    <>
      <rect x="2" y="13" width="20" height="7" rx="2" />
      <path d="M6 16.5h.01M10 16.5h.01M7 9.5a7 7 0 0 1 10 0M9.5 11.5a3.5 3.5 0 0 1 5 0M12 13V9.5" />
    </>
  ),
  SWITCH: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <path d="M6 12h1M9.5 12h1M13 12h1M16.5 12h1" />
    </>
  ),
  SERVER: (
    <>
      <rect x="4" y="3" width="16" height="7" rx="1.5" />
      <rect x="4" y="14" width="16" height="7" rx="1.5" />
      <path d="M8 6.5h.01M8 17.5h.01M12 6.5h4M12 17.5h4" />
    </>
  ),
  PC: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4M8 20h8" />
    </>
  ),
  NAS: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M8 6h8M8 10h8M8 14h8M15 18.5h.01" />
    </>
  ),
  FIREWALL: (
    <>
      <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
      <path d="M8 10h8M8 14h8M12 6v4M10 14v4M14 14v4" />
    </>
  ),
  ACCESS_POINT: (
    <>
      <circle cx="12" cy="17" r="1.5" />
      <path d="M8.5 13.5a5 5 0 0 1 7 0M5.5 10.5a9 9 0 0 1 13 0M2.5 7.5a13 13 0 0 1 19 0" />
    </>
  ),
  PRINTER: (
    <>
      <path d="M7 8V3h10v5M7 17H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-3" />
      <rect x="7" y="14" width="10" height="7" />
    </>
  ),
  CLOUD: <path d="M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 10z" />,
  OTHER: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
    </>
  ),
};

export function DeviceIcon({ type, className }: { type: DeviceType; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[type]}
    </svg>
  );
}
