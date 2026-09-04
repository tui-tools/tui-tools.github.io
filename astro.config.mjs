// @ts-check
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * A tool's page is only as fresh as its latest release, and that date is
 * already in the catalog — so `lastmod` costs nothing but a lookup.
 *
 * The pages that carry no release date of their own — the grid, install,
 * security, kit, the guides index — are rebuilt from the catalog every time it
 * is regenerated, so the catalog's own `generatedAt` is their honest `lastmod`
 * rather than an invented one. Every URL in the sitemap therefore has one,
 * which is what a crawler uses to decide what to come back for.
 *
 * The catalog is generated (and gitignored), so a build that runs before it
 * exists still works — it just ships a sitemap without any `lastmod`.
 */
function readCatalog() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "src/data/catalog.json"), "utf8"));
  } catch {
    return null;
  }
}

function releaseDatesByPath(catalog) {
  return new Map(
    (catalog?.tools ?? [])
      .filter((tool) => tool.release?.publishedAt)
      .map((tool) => [`/tools/${tool.name}/`, tool.release.publishedAt]),
  );
}

/**
 * The same idea for guides: a guide carries a real publication date, and an
 * `updated:` when it was materially changed, so `lastmod` is a fact rather
 * than an invention.
 *
 * The frontmatter is read here with a small regexp rather than through
 * `astro:content`, because this file is evaluated before the content layer
 * exists. `draft: true` is skipped for the same reason src/lib/guides.js skips
 * it: a draft has no page, so it must have no sitemap entry either.
 */
function guideDatesByPath() {
  const dir = join(ROOT, "src/content/guides");
  const entries = new Map();
  let files;
  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".mdx"));
  } catch {
    return entries;
  }
  for (const file of files) {
    const source = readFileSync(join(dir, file), "utf8");
    const front = source.split(/^---$/m)[1] ?? "";
    if (/^draft:\s*true\s*$/m.test(front)) continue;
    const date =
      front.match(/^updated:\s*(\S+)\s*$/m)?.[1] ??
      front.match(/^date:\s*(\S+)\s*$/m)?.[1];
    if (date) entries.set(`/guides/${file.replace(/\.mdx$/, "")}/`, date);
  }
  return entries;
}

const catalog = readCatalog();

// The day the catalog was built: the fallback for every page whose content is
// the catalog. A build with no catalog yet has none, and those pages then ship
// without a `lastmod` exactly as they did before.
const generatedAt = catalog?.generatedAt ?? null;

const lastmodByPath = new Map([
  ...releaseDatesByPath(catalog),
  ...guideDatesByPath(),
]);

// The organization site repository serves at the root, so there is no base
// path to carry around — and switching to a custom domain later changes only
// `site`, not a single link in the pages.
export default defineConfig({
  site: process.env.SITE_URL ?? "https://tui.tools",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [
    // Guides are .mdx so their prose stays markdown while the commands a
    // reader is meant to copy are the site's own CommandDialog, the same
    // component every other page shows a command in.
    mdx(),
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname;
        const lastmod = lastmodByPath.get(path) ?? generatedAt;
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
