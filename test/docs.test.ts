// Checks on the Markdown files: mistakes no reader should see and links that lead nowhere.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function markdownIn(dir: string, recursive: boolean): string[] {
  const path = join(ROOT, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path, { recursive, encoding: "utf8" })
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(path, name));
}

const DOCS = [
  ...markdownIn(".", false),
  ...markdownIn("docs", true),
  ...markdownIn(".github", true),
].sort();

// The text a reader sees as text: without code blocks, inline code or HTML comments.
function prose(text: string): string {
  return text
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/`[^`\n]*`/g, "");
}

// GitHub's anchor for a heading: lower case, punctuation removed, spaces as hyphens.
function anchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\w\u00C0-\u024F\- ]/g, "")
    .replace(/ /g, "-");
}

function anchors(path: string): Set<string> {
  const text = readFileSync(path, "utf8").replace(/^```[\s\S]*?^```/gm, "");
  return new Set([...text.matchAll(/^#+ (.+)$/gm)].map((match) => anchor(match[1])));
}

function links(text: string): string[] {
  const targets = [
    ...[...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]),
  ];
  return targets.filter((target) => !/^[a-z]+:/.test(target)); // http:, https:, mailto:...
}

describe.each(DOCS.map((path) => [relative(ROOT, path), path]))("%s", (_name, path) => {
  const text = readFileSync(path, "utf8");

  it("has no literal escape sequences in the text", () => {
    // A "\n" typed by an editing tool instead of a line break shows up as text on GitHub
    expect(prose(text).match(/.{0,30}\\[nt](?![A-Za-z]).{0,10}/g) ?? []).toEqual([]);
  });

  it("has relative links that lead somewhere", () => {
    const broken = links(prose(text)).filter((target) => {
      const [file, hash] = target.split("#", 2);
      const linked = file ? resolve(dirname(path), file) : path;
      // (the heading is only looked for once the file is known to exist)
      return !existsSync(linked) || (!!hash && linked.endsWith(".md") && !anchors(linked).has(hash));
    });
    expect(broken).toEqual([]);
  });
});

it("finds the Markdown files", () => {
  expect(DOCS.map((path) => relative(ROOT, path))).toContain("README.md");
});
