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
  channels, security posture, maintainers, and the **backends** the tool drives
  with everything it knows about their versions;
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

### Backend compatibility

A tool that drives someone else's program declares it in the manifest's
`backends[]`, and the site renders that block as the **Compatibility** section
on the tool page: the binary, the minimum version the tool claims, the versions
it has really been tested against, the features that need a given version, and
the version-ranged caveats with what each one does to the user. The grid card
carries the short form of the same fact — `ufw ≥ 0.36` — because that is what
decides whether the tool is worth opening. A tool that shells out to nothing
declares no backends and neither surface shows anything.

`tested` is evidence rather than a claim: the versions come from
`compat/results.jsonl` in the tool's own repository, which its smoke suite
writes while running inside a [tui-lab](https://github.com/tui-tools/tui-lab)
guest, and `tui-kit/tools/compat-sync.py` regenerates the manifest from. The
running binary reads the same block to probe the backend at startup, so a
version the site does not list is one the tool's header marks `(untested)`. The
whole mechanism is documented in
[`tui-kit/docs/compatibility.md`](https://github.com/tui-tools/tui-kit/blob/main/docs/compatibility.md).

`scripts/build-catalog.mjs` copies the block into the catalog minus the fields
only the running binary needs — `versionRegex` and `searchPaths` — since the
probe is the tool's business, not the website's.

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

This is the custom domain *on Pages*. To move the domain to a container host
instead, see [Cutover to Quave ONE](#cutover-to-quave-one-owner-action) below,
which supersedes this.

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

## Hosting

The site runs on GitHub Pages today. It is also packaged as a container, so it
can move to [Quave ONE](https://quave.one) — where the family's analytics
already run — without a rewrite. Nothing below is switched on yet; it is the
path, prepared.

### The image

[`Dockerfile`](Dockerfile) is two stages:

1. **`node:22-alpine`** runs `npm ci`, then the same two commands the workflow
   runs: `npm run catalog` and `astro build`. The container and Pages are
   therefore built from the same source of truth and cannot drift.
2. **`nginx:1.29-alpine`** serves `dist/` and nothing else — no Node, no
   `node_modules`, no token in the shipped image.

Two build arguments:

| Arg | Default | Why |
| --- | --- | --- |
| `SITE_URL` | `https://tui.tools` | The canonical host. Feeds `site`, and through it every canonical link, the sitemap and `robots.txt`. |
| `GITHUB_TOKEN` | empty | Lifts the GitHub API rate limit for the catalog step. |

`GITHUB_TOKEN` is worth spelling out. Without it the catalog script uses the
anonymous GitHub API, capped at **60 requests per hour per IP** and shared with
every other anonymous caller behind the same address. One catalog run costs
roughly three requests per tool plus one for the org listing, which fits today
and will not once the family grows or the build runs on a shared runner. And the
script's safety net — *keep the catalog already on disk* — has nothing to keep in
a fresh container, so a rate-limited build **fails** rather than shipping a
stale site. Set the token for any build that is not a one-off local one. On
Quave ONE that means an env var marked **Build** or **Both**, which the platform
passes in as the `ARG` the Dockerfile declares.

[`nginx.conf`](nginx.conf) is copied in as a *template*: the entrypoint runs
`envsubst` over it at start-up, so `listen ${PORT}` resolves then. The image
defaults to `PORT=3000`, which is Quave ONE's default app port — keep the two
equal. `NGINX_ENVSUBST_FILTER` limits the substitution to `PORT` so nginx's own
`$uri` survives it. The server block gives `/_astro/` a year (Astro fingerprints
those names), other images a day, HTML and the SEO files `no-cache`, serves a
real `404.html` instead of the SPA-style "index.html with a 200", answers
`/healthz` for the platform probe, and sets the security headers from
[`security-headers.conf`](security-headers.conf).

Build and check it locally:

```sh
docker build \
  --build-arg SITE_URL=https://tui.tools \
  --build-arg GITHUB_TOKEN="$(gh auth token)" \
  -t tui-tools-site .

docker run --rm -p 8099:3000 tui-tools-site
curl -s localhost:8099/ | grep -o '<title>[^<]*</title>'
curl -s localhost:8099/sitemap-index.xml
curl -s localhost:8099/robots.txt
```

### Keeping the container host current

The site's content lives outside this repository: a release in another repo
changes a page here with no commit to push. That is why Pages rebuilds hourly
rather than only on push, and a container host has the same problem without the
same answer — nothing in its git history changed, so nothing tells it to
rebuild.

`publish.yml` has a `ship` job for that. Quave ONE pulls from GitHub only where
its GitHub App is installed, and it is not installed on this organization, so
the job pushes instead: the documented three-step **Code API** — ask for a
pre-signed URL, `PUT` the source tarball, say it landed — and the third step
triggers the build. The image builds the catalog itself, so a build is a fresh
site.

That leaves one wrinkle. The platform reuses the image it already built when the
source is unchanged, which is right in general and wrong here: every hourly run
sends identical source while the *content* has moved on. So the tarball carries
a `.build-stamp` file holding the SHA-256 of the catalog that run built. Nothing
changed upstream, same stamp, same source, image reused and no build minutes
spent; a release shipped, the catalog changes, and the stamp changes the source
and the Dockerfile's `COPY . .` layer with it.

The job is **skipped** unless the repository variable `QUAVE_ENV_NAME` is set:

```sh
gh variable set QUAVE_ENV_NAME  --body tui-tools-tui-site-production
gh secret   set QUAVE_API_TOKEN                  # the app-environment token
```

Set `QUAVE_ENV_NAME` without the secret and the job fails loudly rather than
leaving a site that quietly stops updating. `QUAVE_API_URL` is optional and
defaults to `https://api.quave.cloud/api/public/v1`.

The token is the **app-environment** token, not a user token: it can deploy this
one environment and nothing else. Read it from the environment's page on Quave
ONE, or rotate it there if it ever leaks.

### If the GitHub App is ever installed

Installing the Quave ONE GitHub App on the `tui-tools` organization would let
the platform pull `main` on push and drop the upload half of the `ship` job. It
would **not** replace it: a push is the trigger that this site does not have —
the hourly rebuild is the point — so the job would still have to run, just with
`forceNewBuild` against the build endpoint instead of a tarball. The upload flow
costs one extra minute per run and needs no click, which is why it is what is
wired today.

### Cutover to Quave ONE (owner action)

Steps 1–4 are **done**. They left Pages serving as it always did, which is the
point: everything up to the DNS change is reversible, and the DNS change is the
owner's.

1. ~~**Create the app**~~ — `tui-site` on the `tui-tools` account, CUSTOM preset
   with the root `Dockerfile`, port 3000, health check `/healthz`, SSL on, one
   zCloud, region `us-5` (where the analytics already live). It deploys by
   source upload rather than from GitHub, because that needed no click; see
   above.
2. ~~**Set the build variables**~~ — `SITE_URL=https://tui.tools`, marked
   *Build*. `GITHUB_TOKEN` is **not** set: the catalog build fits inside the
   anonymous API's 60-per-hour limit today, and the first build proved it. If a
   build ever fails on a rate limit, that is the moment to add one — see below.
3. ~~**Turn on the rebuild signal**~~ — `QUAVE_ENV_NAME` and `QUAVE_API_TOKEN`
   are set, and the `ship` job runs on every `publish`.
4. ~~**Add the hosts**~~ — `tui.tools` and `www.tui.tools` on the site
   environment, `analytics.tui.tools` on the Umami one. All three sit
   `VALIDATING` until DNS answers. A host that stays invalid long enough is
   auto-disabled and has to be re-enabled from the Hosts tab, so do not leave
   step 5 for weeks.
5. **Point DNS** — the records are in the table below. `tui.tools` is an apex,
   so it needs an `ALIAS`/`ANAME` record, or Cloudflare's CNAME flattening,
   which does the same thing at the resolver. A registrar that offers neither
   cannot serve the apex from a container host at all; host at `www.tui.tools`
   and redirect the apex there instead. Certificates issue on their own once the
   names resolve.
6. ~~**Set `SITE_DOMAIN`**~~ — already `tui.tools`, so the Pages build renders
   the same canonical host the container does. For the overlap in which both are
   up, they agree.
7. **Retire Pages** once Quave ONE has served the domain for a few days without
   incident: delete the `deploy` job (and the `pages`/`id-token` permissions and
   the `write CNAME` step) from `publish.yml`, leaving `build` as the check that
   the site still compiles and `ship` as the thing that ships it. Then turn
   Pages off in the repository settings.

| Type | Name | Value |
| --- | --- | --- |
| `ALIAS` / `ANAME` (or a flattened `CNAME`) | `tui.tools` | `tui-tools-tui-site-production.zcloud.services` |
| `CNAME` | `www.tui.tools` | `tui-tools-tui-site-production.zcloud.services` |
| `CNAME` | `analytics.tui.tools` | `tui-tools-tui-analytics-production.zcloud.services` |

The one thing to *not* do out of order is step 5 before step 4: DNS pointing at
a host that has not been told to answer for the domain is a hard outage, whereas
every other step is inert until the one after it.

### After DNS

Two follow-ups, neither of which can be done before the names resolve:

- Point the Umami tag in `src/layouts/Base.astro` at `https://analytics.tui.tools/script.js`,
  and change the website's domain inside Umami to match, so the existing numbers
  keep accruing to the same site.
- Turn on *Enforce HTTPS* wherever Pages is still serving, until step 7 retires
  it.

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
| `src/pages/tools/[name].astro` | A tool: gallery, description, keys, compatibility, install picker, security, downloads, releases |
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
