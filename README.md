<img src="public/brand/logo-dark.svg" alt="tui-tools" width="240">

The family website: **[tui-tools.github.io](https://tui-tools.github.io)**.

A marketplace for the [tui-tools](https://github.com/tui-tools) family, built
entirely from each tool's own `tool.json`. Nothing here is edited by hand to add
a tool, change a version, or update a screenshot.

![The marketplace grid](docs/screenshots/home.png)

![A tool's page](docs/screenshots/tool.png)

## How it works

```
tui-tools/<tool>/tool.json  ─┐
GitHub releases API         ─┼─► scripts/build-catalog.mjs ─► src/data/catalog.json ─► astro build ─► Pages
icons and screenshots       ─┘
```

`scripts/build-catalog.mjs` lists the public repositories in the organization
and asks each one for a `tool.json` at the default branch's HEAD. A repository
that has one is a tool; one that does not — `tui-kit`, `.github`, this
repository — is simply not in the grid. For each tool it then collects:

- the **manifest**: tagline, description, category, platforms, keys, install
  channels, security posture, maintainers;
- the **latest release**: tag, date, every asset with its size, and the SHA-256
  sums parsed out of that release's `checksums.txt`;
- the **release history**, for the changelog list on the tool page;
- the **images** the manifest points at — the icon and every screenshot —
  downloaded into `public/tools/<name>/`, so the site serves its own copies and
  loads nothing from an external host at runtime.

A tool with no release yet is kept and marked **unreleased** rather than
hidden. `tui-template` is the standing example.

The schema those manifests are validated against lives in the kit:
[`tui-kit/schema/tool.schema.json`](https://github.com/tui-tools/tui-kit/blob/main/schema/tool.schema.json),
documented in
[`tui-kit/docs/tool-manifest.md`](https://github.com/tui-tools/tui-kit/blob/main/docs/tool-manifest.md).

## Adding a tool to the site

There is no step in this repository.

1. Start from [tui-template](https://github.com/tui-tools/tui-template) and
   build the tool.
2. Fill in its `tool.json` — the template's copy is a valid example, and CI
   validates it against the schema on every push.
3. Tag `v0.1.0` and let the release ship.
4. The site picks it up on its **next hourly build**, or immediately if the
   tool's release workflow dispatches (see below).

## Publishing

[`.github/workflows/publish.yml`](.github/workflows/publish.yml) runs on:

| Trigger | Why |
| --- | --- |
| push to `main` | a change to the site itself |
| `schedule`, hourly at :17 | a release that did not dispatch still appears within the hour |
| `workflow_dispatch` | rebuild on demand |
| `repository_dispatch`, type `tool-released` | a release just shipped, rebuild now |

It builds the catalog, runs `astro build`, and deploys `dist/` with
`actions/deploy-pages`. Pages is configured with **GitHub Actions** as its
source; there is no `gh-pages` branch.

### The dispatch token (owner action)

Every tool's CI already carries the step that wakes this site, and it is inert
until the secret exists:

```yaml
- name: notify the website
  if: env.SITE_DISPATCH_TOKEN != ''
  env:
    GH_TOKEN: ${{ env.SITE_DISPATCH_TOKEN }}
  run: |
    gh api repos/tui-tools/tui-tools.github.io/dispatches \
      -f event_type=tool-released \
      -f 'client_payload[tool]=tui-firewall'
```

To turn it on, create a **fine-grained personal access token**:

- **Resource owner**: the `tui-tools` organization.
- **Repository access**: only `tui-tools/tui-tools.github.io`.
- **Permissions**: `Contents: Read and write` — that is what the
  `POST /repos/{owner}/{repo}/dispatches` endpoint requires.
- Then add it as the secret `SITE_DISPATCH_TOKEN` in each tool repository, or
  once as an **organization** secret scoped to the tool repositories.

Without it, nothing breaks: the hourly build covers the same ground with at
most an hour's delay. A GitHub App installation token works too, and is the
better answer if the family grows.

### The custom domain (owner action)

The site is written so switching to `tui.tools` is two settings and no code:

1. Set the repository **variable** `SITE_DOMAIN` to `tui.tools`
   (`gh variable set SITE_DOMAIN --repo tui-tools/tui-tools.github.io --body tui.tools`).
   The workflow then writes `dist/CNAME` and builds the canonical URLs against
   the new host.
2. Add the DNS record: `CNAME tui.tools → tui-tools.github.io`. For an apex
   domain, use the four `A` records GitHub documents for Pages instead, and
   keep a `CNAME` for `www`.

Do **both**. Setting the variable without the DNS record leaves Pages serving a
domain that does not resolve; adding the DNS record without the variable leaves
Pages redirecting to `tui-tools.github.io`. Once DNS is live, turn on *Enforce
HTTPS* in the repository's Pages settings.

Nothing else in the site hardcodes the host: every internal link is
root-relative, which is why this is the organization site repository
(`tui-tools.github.io`, served at `/`) rather than a project repository served
under a path. The three places that need an absolute URL — the canonical link,
`sitemap-index.xml` and `robots.txt` — all derive it from the same `site` value,
so `SITE_URL` is the only knob.

### Sitemap and robots

Both are generated at build time and neither is committed:

- **`sitemap-index.xml` / `sitemap-0.xml`** come from
  [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/),
  which walks the pages Astro actually rendered — so a new tool appears in the
  sitemap for the same reason it appears in the grid, with no list to maintain.
  A tool page carries a `lastmod` taken from its latest release date; a page with
  no such date carries none, because an invented `lastmod` is worse than an
  absent one.
- **`robots.txt`** is the endpoint `src/pages/robots.txt.js`, which points at
  the sitemap on whatever host `site` names.

## Local development

```sh
npm install
GITHUB_TOKEN=$(gh auth token) npm run dev     # catalog, then the dev server
GITHUB_TOKEN=$(gh auth token) npm run build   # catalog, then a static build
npm run build:only                            # rebuild the pages, reuse the catalog
npm run preview
```

`GITHUB_TOKEN` is optional — without it the catalog script uses the anonymous
API and its 60-requests-per-hour limit, which is enough for one run. If a run
fails while a `catalog.json` is already on disk, the script keeps the old one
and exits successfully, so a rate limit or a dropped connection cannot leave you
without a site to build.

`src/data/catalog.json` and `public/tools/` are generated and gitignored.

## What is in here

| Path | What it is |
| --- | --- |
| `scripts/build-catalog.mjs` | The whole data layer: org → manifests → releases → images → `catalog.json` |
| `src/pages/index.astro` | The marketplace grid, with a category filter |
| `src/pages/tools/[name].astro` | A tool: gallery, description, keys, install picker, security, downloads, releases |
| `src/pages/install.astro` | Family-level install: the repository setup per package manager, and how to verify a download |
| `src/pages/security.astro` | The family's principles, every tool's answers, and how to report |
| `src/pages/kit.astro` | What `tui-kit` is |
| `src/pages/robots.txt.js` | `robots.txt`, built from `site` so no host is hardcoded |
| `src/components/CommandDialog.astro` | The site's one borrowed idea, below |
| `src/lib/markdown.js` | The safe markdown subset a manifest's `description` may use |
| `src/styles/global.css` | Tokyo Night, and the type rule: the machine speaks in mono, we speak in sans |

![The install page](docs/screenshots/install.png)

## Analytics

The site counts visits with [Umami](https://umami.is), self-hosted on
[Quave ONE](https://quave.one). Nothing is sent to Google, and there is no
third-party network the numbers feed into.

**What is collected.** A page view: the path, the referrer, the screen size, the
browser and OS names, and a country derived from the request. Plus the named
events below, each with a couple of labels. That is the whole list.

**What is not.** No cookies and no `localStorage`: Umami stores nothing in your
browser. No IP address is kept — it is hashed together with a daily-rotating
salt to recognise a repeat visit within one day, and cannot be reversed or
linked across days. No cross-site identifier, no profile, no ad network.

**Events.** These names are stable; treat them as an interface, and add rather
than rename.

| Event | Fired when | Props |
| --- | --- | --- |
| `install-copy` | A command's copy button is pressed | `tool`, `manager` |
| `distro-select` | A package manager tab is chosen on a tool page | `manager` |
| `download` | A release asset link is clicked | `tool`, `asset` |
| `repo-click` | A tool's source repository link is clicked | `tool` |

`tool` is a tool name (or `family` for a command that is not tool-specific),
`manager` is the install path (`pacman`, `aur`, `apt`, `dnf`, `zypper`,
`binary`, `source`, …).

**How to opt out.** Turn on "Do Not Track" in your browser and the script stands
down: the tag carries `data-do-not-track="true"`, so it sends nothing at all.
Any content blocker also stops it, and the site works exactly the same without
it — nothing on the page waits for the script, and nothing breaks when it never
arrives.

## The design, in one paragraph

Every tool in the family shows a command inside a box and asks `y` or `n` before
running it. Installing a tool is previewed the same way here: every command on
the site sits in that same dialog, and the copy button **is** the `y` key. The
palette is Tokyo Night, carrying the meaning the branding gives it — green marks
what the family shares, blue marks what one tool adds, so family pages accent
green and a tool's page accents blue. Anything the machine says is set in
monospace; anything we say is set in sans. Fonts are a system stack and every
image is served from this repository; the one request that leaves the page is
the analytics script described above.

## Unofficial

These tools follow the [Omarchy](https://omarchy.org) visual style and read its
theme files. They are **not** part of the Omarchy project and are not endorsed
by its maintainers.

MIT — see [LICENSE](LICENSE).
