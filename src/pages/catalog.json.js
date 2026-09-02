/**
 * /catalog.json — the family catalog, for programs rather than readers.
 *
 * The site's pages are built from src/data/catalog.json, a large document
 * shaped by what a page needs to render: markdown descriptions, per-manager
 * command lines, release assets with their checksums, ten releases of history.
 * A program does not want any of that. It wants the list of tools, what each
 * one is called to a package manager, which version is current, and where to
 * read more — a small, stable document it can poll.
 *
 * So this endpoint is a projection, not a second source: every field below is
 * copied from the catalog the pages already read, and nothing is computed that
 * a page does not also show. `schema` is the contract; it is bumped only when
 * a field changes meaning, and new fields are added without bumping it.
 *
 * It informs, and it is never a source of trust. The versions here are what
 * the last hourly build saw on GitHub, which is a claim, not a signature.
 * Installing goes through the signed repository — the package manager verifies
 * the repository index and the package, and that verification is the only
 * thing that decides whether a byte reaches the machine. A launcher reading
 * this file is choosing what to ask apt, dnf or pacman for; it is not deciding
 * what to trust.
 *
 * Absolute URLs are built from `site`, so the document a program fetches from
 * a preview host points at that host and never at the production one.
 */
import catalog from "../data/catalog.json";

/** The tool name a program is allowed to act on. Anything else is not ours. */
const NAME = /^tui-[a-z]+$/;

/** The package managers whose package name is the family's own. */
const DISTRO_CHANNELS = ["pacman", "apt", "dnf"];

/**
 * The three repository lines, read back out of the one-time setup the install
 * page prints — the same block tui-kit's render-install.py writes into every
 * tool's README. Reading them from that text rather than restating them here
 * is what keeps this endpoint from drifting away from the page: there is one
 * place the lines are written, and it is not this file.
 *
 * apt takes a sources line, pacman takes a Server line, and dnf takes neither:
 * its repository is a .repo file the setup downloads, so the file's URL is the
 * honest answer for that channel.
 */
function repositoryLines(tools) {
  const manual = (id) => {
    for (const tool of tools) {
      const setup = tool.install?.find((entry) => entry.id === id)?.setup;
      if (setup?.manual) return setup.manual;
    }
    return null;
  };

  const deb = manual("apt")?.match(/"(deb \[signed-by=[^"]+)"/);
  const arch = manual("pacman")?.match(/Server = ([^\s\\]+)/);
  const rpm = manual("dnf")?.match(/-o \/etc\/yum\.repos\.d\/\S+ (\S+)/);

  return {
    deb: deb ? deb[1] : null,
    rpm: rpm ? rpm[1] : null,
    arch: arch ? `Server = ${arch[1]}` : null,
  };
}

/**
 * The manifest's backends, keyed by name: the floor the tool claims, the
 * versions the lab has really run, the version-gated features and the
 * version-ranged caveats. A tool that shells out to nothing has an empty one.
 */
function compat(tool) {
  const block = {};
  for (const backend of tool.backends ?? []) {
    block[backend.name] = {
      binary: backend.binary,
      minimum: backend.minimum ?? null,
      tested: backend.tested ?? [],
      features: backend.features ?? [],
      notes: backend.notes ?? [],
    };
  }
  return block;
}

/** An absolute URL for a site-relative path the catalog downloaded. */
const absolute = (path, site) => (path ? new URL(path, site).href : null);

function entry(tool, site) {
  const distro = tool.install?.find((method) =>
    DISTRO_CHANNELS.includes(method.id),
  );

  // Key order is fixed here, and JSON.stringify preserves insertion order, so
  // two builds that saw the same data produce byte-identical documents apart
  // from `generated`.
  return {
    name: tool.name,
    package: distro?.package ?? tool.name,
    binary: tool.binary,
    tagline: tool.tagline,
    description: tool.description,
    category: tool.category,
    icon: absolute(tool.icon, site),
    screenshot: absolute(tool.screenshots?.[0]?.src, site),
    version: tool.release?.version ?? null,
    released: tool.release?.publishedAt ?? null,
    unreleased: tool.unreleased === true,
    platforms: tool.platforms ?? [],
    license: tool.license,
    backends: (tool.backends ?? []).map((backend) => backend.name),
    compat: compat(tool),
    repo: tool.repo,
    page: new URL(`/tools/${tool.name}/`, site).href,
    changelog: tool.release?.url ?? null,
  };
}

/**
 * A companion: something the family ships that is not a terminal UI. Same
 * projection rule as a tool — nothing computed that a page does not also show
 * — and the same trust rule: the version is what the last build saw, and the
 * package manager is still the only thing that decides what reaches a machine.
 */
function companionEntry(companion) {
  return {
    name: companion.name,
    kind: companion.kind,
    summary: companion.summary,
    packages: companion.packages ?? [companion.name],
    version: companion.release?.version ?? null,
    released: companion.release?.publishedAt ?? null,
    unreleased: companion.unreleased === true,
    upstream: companion.upstream ?? null,
    upstream_version: companion.upstreamVersion ?? null,
    homepage: companion.homepage ?? null,
    repo: companion.repo,
    changelog: companion.release?.url ?? null,
  };
}

export function GET({ site }) {
  // A name that is not `tui-<word>` is not a tool this document describes, and
  // a program reading it should never be handed one to pass to a shell.
  const tools = catalog.tools
    .filter((tool) => NAME.test(tool.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => entry(tool, site));

  // The non-TUI packages, in their own list so a program that only wants tools
  // keeps reading `tools` and is never handed a mirror by accident.
  const companions = (catalog.companions ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(companionEntry);

  const pkgs = catalog.pkgs ?? { url: "https://pkgs.tui.tools", live: false };
  const lines = repositoryLines(catalog.tools);

  const body = {
    schema: 1,
    generated: catalog.generatedAt,
    // The family's own status, for a program that has to decide whether to
    // trust the names below to stay put. Additive, so `schema` does not move:
    // a reader that does not know this field is no worse off than before.
    // `stable_from` is the release the family is declared stable at; it is null
    // until that decision is made, and the same decision removes the site's
    // beta banner. `notice` is the canonical beta sentence, the same one the banner
    // shows and the tool READMEs carry, word for word.
    family: {
      status: "beta",
      stable_from: null,
      notice:
        "Beta: the family is days old and still changing. Package names, flags and keys may move without notice until 1.0. Pin versions, and report what breaks.",
    },
    packages: {
      repo: pkgs.url,
      install_script: `${pkgs.url}/install.sh`,
      // Whether the repository answered when this catalog was built. It is
      // reported rather than assumed: a launcher that finds it false should
      // say so instead of running a setup that cannot work.
      live: pkgs.live === true,
      deb: lines.deb,
      rpm: lines.rpm,
      arch: lines.arch,
    },
    signing: {
      // The site documents the key by its URL and by the setup commands that
      // import it; it publishes no fingerprint, so none is stated here. The
      // fingerprint a machine should trust is the one it reads out of the key
      // it imported, not one this document told it to expect.
      pubkey: `${pkgs.url}/pubkey.asc`,
    },
    tools,
    companions,
  };

  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // A static build writes this route to dist/catalog.json and the server
      // in front of it decides the response headers, so these three are the
      // declaration of what the document needs rather than what ships it:
      // nginx.conf sets the same three for the container host, and GitHub
      // Pages serves .json as application/json with its own permissive CORS.
      // They do apply under `astro dev` and under any SSR adapter.
      //
      // A public, read-only document fetched by other programs, including from
      // a browser, hence the open CORS. The site is rebuilt hourly; ten minutes
      // of cache keeps a poller off the origin without letting a new release
      // sit unseen for long.
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=600",
    },
  });
}
