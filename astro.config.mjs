// @ts-check
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * A tool's page is only as fresh as its latest release, and that date is
 * already in the catalog — so `lastmod` costs nothing but a lookup. Pages that
 * have no such date (the grid, install, security, kit) get none: an invented
 * `lastmod` is worse than an absent one.
 *
 * The catalog is generated (and gitignored), so a build that runs before it
 * exists still works — it just ships a sitemap without any `lastmod`.
 */
function releaseDatesByPath() {
  try {
    const catalog = JSON.parse(
      readFileSync(join(ROOT, "src/data/catalog.json"), "utf8"),
    );
    return new Map(
      (catalog.tools ?? [])
        .filter((tool) => tool.release?.publishedAt)
        .map((tool) => [`/tools/${tool.name}/`, tool.release.publishedAt]),
    );
  } catch {
    return new Map();
  }
}

const lastmodByPath = releaseDatesByPath();

// The organization site repository serves at the root, so there is no base
// path to carry around — and switching to a custom domain later changes only
// `site`, not a single link in the pages.
export default defineConfig({
  site: process.env.SITE_URL ?? "https://tui-tools.github.io",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname;
        const lastmod = lastmodByPath.get(path);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
