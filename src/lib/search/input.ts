import { z } from "zod";
import { collapseSpaces } from "@/lib/customers/input";
import { DEVICE_TYPES, DEVICE_TYPE_LABELS, type DeviceType } from "@/lib/map/input";

// The search term and how a match is shown. No database access, so the search
// box (a client component) shares the limits.

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

// A single letter matches almost everything; a longer term is not a search.
export const searchTermSchema = z
  .string()
  .transform(collapseSpaces)
  .pipe(z.string().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH));

export function parseSearchTerm(raw: unknown): string | null {
  const parsed = searchTermSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// The types whose Spanish name contains the term, so "servidor" finds every
// server even if none is called that.
export function matchingDeviceTypes(term: string): DeviceType[] {
  const needle = term.toLocaleLowerCase("es");
  return DEVICE_TYPES.filter((type) =>
    DEVICE_TYPE_LABELS[type].toLocaleLowerCase("es").includes(needle),
  );
}

export function contains(text: string, term: string): boolean {
  return text.toLocaleLowerCase("es").includes(term.toLocaleLowerCase("es"));
}

// Room for a few words on each side of the match in a results row.
const EXCERPT_CONTEXT = 60;

// The line that holds the match (values are multi-line: DHCP reservations,
// notes), cut around it when the line is long. Without a match, the first line.
export function excerpt(text: string, term: string): string {
  const lines = text.split("\n");
  const line = lines.find((candidate) => contains(candidate, term)) ?? lines[0] ?? "";
  const at = line.toLocaleLowerCase("es").indexOf(term.toLocaleLowerCase("es"));
  if (line.length <= term.length + 2 * EXCERPT_CONTEXT) return line.trim();
  const centre = at === -1 ? 0 : at;
  const start = Math.max(0, centre - EXCERPT_CONTEXT);
  const end = Math.min(line.length, centre + term.length + EXCERPT_CONTEXT);
  const before = start > 0 ? "…" : "";
  const after = end < line.length ? "…" : "";
  return before + line.slice(start, end).trim() + after;
}

export type Segment = { text: string; match: boolean };

// The text split around every occurrence of the term, so the page can mark
// them without building HTML.
export function highlight(text: string, term: string): Segment[] {
  const haystack = text.toLocaleLowerCase("es");
  const needle = term.toLocaleLowerCase("es");
  // Lowercasing can change the length (rare letters); then nothing is marked
  // rather than the wrong characters.
  if (!needle || haystack.length !== text.length) return [{ text, match: false }];

  const segments: Segment[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) segments.push({ text: text.slice(from, at), match: false });
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) segments.push({ text: text.slice(from), match: false });
  return segments;
}
