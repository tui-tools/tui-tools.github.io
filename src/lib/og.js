/**
 * The address of a page's link preview, as scrapers and structured data both
 * need it.
 *
 * scripts/build-og.mjs draws one 1200x630 card per page into public/og/, and
 * a page names its card by slug: `home`, `tui-firewall`, `guides/<slug>`.
 *
 * Absolute, because every scraper that reads these (X, Slack, LinkedIn)
 * treats a relative og:image as a reason to show nothing. The query string
 * carries a hash of the card's bytes: scrapers cache a preview by the image
 * URL, so a redrawn card would otherwise keep showing the old one until their
 * cache expired. A missing card (built before its PNG exists) gets no version.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export function ogImageUrl({ slug, base }) {
  const url = new URL(`/og/${slug}.png`, base ?? "https://tui.tools");
  try {
    // Resolved from the project root, not from this file: at build time Astro
    // runs compiled code from a temporary location, so a path relative to
    // import.meta.url would point nowhere and silently drop the version.
    const bytes = readFileSync(join(process.cwd(), "public", "og", `${slug}.png`));
    url.searchParams.set("v", createHash("sha256").update(bytes).digest("hex").slice(0, 10));
  } catch {
    // No card on disk: leave the URL unversioned.
  }
  return url.href;
}
