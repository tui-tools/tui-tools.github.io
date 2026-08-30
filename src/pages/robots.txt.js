/**
 * robots.txt, generated from `site` rather than committed.
 *
 * The host lives in exactly one place — `astro.config.mjs`, fed by SITE_URL —
 * so moving the site to another domain never leaves a stale absolute URL
 * pointing search engines at the old one.
 */
export function GET({ site }) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${new URL("sitemap-index.xml", site)}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
