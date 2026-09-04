/**
 * The structured data the site publishes, built from the catalog and the
 * guides collection rather than written per page.
 *
 * Every builder returns a plain object; `renderJsonLd` turns a page's nodes
 * into the one `<script type="application/ld+json">` the layout prints. A page
 * therefore never assembles JSON by hand, which is what keeps a tagline with a
 * quote or an angle bracket in it from breaking the document.
 */

const SITE = "https://tui.tools/";
const ORG_NAME = "tui-tools";
const ORG_GITHUB = "https://github.com/tui-tools";
const LOGO = "https://tui.tools/brand/icon-256.png";

/** The organization node every other node points at as author and publisher. */
export function organization() {
  return {
    "@type": "Organization",
    name: ORG_NAME,
    url: SITE,
    logo: LOGO,
    sameAs: [ORG_GITHUB],
  };
}

/** The site node, for the home page. */
export function webSite() {
  return {
    "@type": "WebSite",
    name: ORG_NAME,
    url: SITE,
    description:
      "Terminal tools for Linux servers that show the system as it is and preview the exact command line of every change before running it.",
    publisher: organization(),
  };
}

/**
 * Absolute, because a consumer of this data has no page to resolve a relative
 * path against. `site` is Astro's configured origin, so a preview build
 * describes itself rather than the production host.
 */
function absolute(path, site) {
  return new URL(path, site ?? SITE).href;
}

/**
 * A tool is an application, and the facts a search engine can show about one
 * are all already in the catalog: the version, the day it shipped, where to
 * download it, what it costs.
 *
 * `applicationCategory` splits the family the way its own catalog does: the
 * template a developer starts a tool from is a developer tool, everything that
 * administers a machine is a utility.
 */
export function softwareApplication({ tool, site, description }) {
  const url = absolute(`/tools/${tool.name}/`, site);
  const screenshot = tool.screenshots?.[0]?.src;
  const published = tool.release?.publishedAt ?? tool.since;

  const node = {
    "@type": "SoftwareApplication",
    name: tool.name,
    url,
    description,
    applicationCategory:
      tool.category === "template" ? "DeveloperApplication" : "UtilitiesApplication",
    operatingSystem: "Linux",
    author: organization(),
    publisher: organization(),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url,
    },
  };

  if (tool.release?.version) node.softwareVersion = tool.release.version;
  if (published) node.datePublished = new Date(published).toISOString().slice(0, 10);
  if (tool.license === "MIT") node.license = "https://opensource.org/license/mit";
  if (tool.repo) {
    node.downloadUrl = `${tool.repo}/releases`;
    node.codeRepository = tool.repo;
  }
  if (screenshot) node.screenshot = absolute(screenshot, site);
  if (tool.keywords?.length) node.keywords = tool.keywords.join(", ");

  return node;
}

/** Home > Tools > tui-firewall. The trail a search result shows above a title. */
export function breadcrumbList({ trail, site }) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absolute(step.path, site),
    })),
  };
}

/**
 * A guide is a TechArticle: it is written from work done on a real machine,
 * and the tools it is about are what it is `about`.
 */
export function techArticle({ guide, url, published, modified, tools = [], site }) {
  const node = {
    "@type": "TechArticle",
    headline: guide.data.title,
    description: guide.data.description,
    url: absolute(url, site),
    datePublished: published,
    author: organization(),
    publisher: organization(),
    inLanguage: "en",
    mainEntityOfPage: { "@type": "WebPage", "@id": absolute(url, site) },
  };
  if (modified && modified !== published) node.dateModified = modified;
  if (tools.length > 0) {
    node.about = tools.map((tool) => ({
      "@type": "SoftwareApplication",
      name: tool.name,
      url: absolute(`/tools/${tool.name}/`, site),
      operatingSystem: "Linux",
      applicationCategory: "UtilitiesApplication",
    }));
  }
  return node;
}

/**
 * One script per page, with `@graph` when the page has more than one node.
 *
 * The escaping is the point: inside a `<script>` element the parser is looking
 * for `</script`, and a lone `<` is enough to end the block in some parsers, so
 * every character that could close it early is written as its JSON escape.
 * U+2028 and U+2029 are escaped too — legal in JSON, fatal in JavaScript.
 */
export function renderJsonLd(nodes) {
  const list = [].concat(nodes).filter(Boolean);
  if (list.length === 0) return "";
  const payload =
    list.length === 1
      ? { "@context": "https://schema.org", ...list[0] }
      : { "@context": "https://schema.org", "@graph": list };

  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
