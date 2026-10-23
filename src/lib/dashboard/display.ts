// How the dashboard and the "Incidentes y agenda" page describe things. No
// database access, so it is unit-tested on its own.

// Up to two letters for a customer's tile: "Estudio Contable Ferreyra" → "EF".
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word));
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1))
    .map((word) => word[0])
    .join("");
  return (letters || "?").toUpperCase();
}

// The tile colours of the mock-up, each a background and an ink colour with a
// contrast above 4.5:1. A customer always gets the same one.
export const TINTS = [
  { background: "#e8eefc", ink: "#1d4ab8" },
  { background: "#e6f1f0", ink: "#1e5e59" },
  { background: "#f3ecfa", ink: "#5b2e91" },
  { background: "#fbf1dc", ink: "#7a5200" },
  { background: "#fdebdd", ink: "#9a3c09" },
  { background: "#f1f3f6", ink: "#4a5260" },
] as const;

export function tintFor(id: string): (typeof TINTS)[number] {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export type ActivityAction = "CREATE" | "UPDATE" | "DELETE" | "REVEAL";

const NOUNS: Record<string, string> = {
  customer: "el cliente",
  device: "el dispositivo",
  connection: "la conexión",
  "device-field": "el campo",
  attachment: "la imagen",
  incident: "el incidente",
  vulnerability: "la vulnerabilidad",
  "agenda-item": "la tarea",
  "end-user": "el usuario final",
};

const VERBS: Record<ActivityAction, string> = {
  CREATE: "Se agregó",
  UPDATE: "Se cambió",
  DELETE: "Se borró",
  REVEAL: "Se vio",
};

// One line of the audit log in words: "Se agregó el dispositivo".
export function describeActivity(action: ActivityAction, entityType: string): string {
  if (entityType === "device-field") {
    return action === "REVEAL" ? "Se vio un secreto" : `${VERBS[action]} un campo de un dispositivo`;
  }
  return `${VERBS[action]} ${NOUNS[entityType] ?? "un registro"}`;
}

// The summary shown with an entry on the home page. A field's entry names the
// field, and the name of a secret field is not searchable, so the home page
// doesn't show it either.
export function activitySummary(entityType: string, summary: string): string {
  return entityType === "device-field" ? "" : summary;
}

// "hace 5 min", "hace 3 h", "hace 2 d" or the day, from the server's clock.
export function timeAgo(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
