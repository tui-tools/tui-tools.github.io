/**
 * /llms.txt, generated from the same sources as the pages.
 *
 * A short plain-text map of the site for language models and other readers
 * that want the shape of the family without parsing HTML (https://llmstxt.org).
 * Like robots.txt and catalog.json it is built from `site`, so a preview host
 * describes itself, and like the sitemap it has no list to maintain: the tools
 * come from the catalog and the guides from the published collection, so a new
 * tool or guide appears here for the same reason it appears on the site.
 */
import catalog from "../data/catalog.json";
import { publishedGuides } from "../lib/guides.js";

const SUMMARY =
  "Terminal tools for Linux that show you the system as it is, and preview the exact command line of every change before running it. One static binary each, no daemon, no state.";

const PAGES = [
  ["Tools", "/", "every tool in the family, with filters by category"],
  ["Install", "/install/", "the signed apt, dnf and pacman repository, and static binaries"],
  ["Guides", "/guides/", "walkthroughs written after the work was done on a real machine"],
  ["Security", "/security/", "what the tools promise at run time and how releases are signed"],
  ["Kit", "/kit/", "tui-kit, the shared library every tool is built on"],
  ["About", "/about/", "who maintains the family and how"],
  ["Catalog", "/catalog.json", "the machine-readable list of tools, versions and packages"],
];

export async function GET({ site }) {
  const url = (path) => new URL(path, site).href;
  const guides = await publishedGuides();

  const lines = [
    "# tui-tools",
    "",
    `> ${SUMMARY}`,
    "",
    "## Pages",
    "",
    ...PAGES.map(([name, path, what]) => `- [${name}](${url(path)}): ${what}`),
    "",
    "## Tools",
    "",
    ...catalog.tools.map(
      (tool) => `- [${tool.name}](${url(`/tools/${tool.name}/`)}): ${tool.tagline}`,
    ),
    "",
    "## Guides",
    "",
    ...guides.map(
      (guide) => `- [${guide.data.title}](${url(`/guides/${guide.id}/`)}): ${guide.data.description}`,
    ),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
