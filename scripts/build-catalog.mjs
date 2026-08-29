#!/usr/bin/env node
/**
 * Build src/data/catalog.json from the tui-tools organization on GitHub.
 *
 * Every repository in the org is asked for a tool.json at the default branch's
 * HEAD. A repository that has one is a tool; a repository that does not — the
 * kit, the org profile — is simply not in the marketplace. For each tool the
 * script also fetches the latest release (tag, date, assets, and the SHA-256
 * sums parsed out of checksums.txt) and downloads the icon and screenshots the
 * manifest points at into public/tools/<name>/, so the site serves its own
 * copies and depends on no external host at runtime.
 *
 * A tool with no release yet is kept, marked unreleased. The site says so
 * rather than hiding it.
 *
 * GITHUB_TOKEN lifts the rate limit; without it the script still works, just
 * with the 60-requests-per-hour ceiling GitHub gives anonymous callers.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORG = process.env.TUI_ORG ?? "tui-tools";
const OUT_JSON = join(ROOT, "src/data/catalog.json");
const ASSET_ROOT = join(ROOT, "public/tools");
const API = "https://api.github.com";

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

/** The architectures a download pattern is expanded for, in display order. */
const ARCHES = ["amd64", "arm64"];

/** Repositories that are never tools, whatever they carry. */
const NEVER_A_TOOL = new Set([".github", `${ORG}.github.io`]);

function headers(accept = "application/vnd.github+json") {
  const h = {
    Accept: accept,
    "User-Agent": `${ORG}-site-catalog`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * A GET that tells 404 apart from a real failure: a missing tool.json or a
 * repository without releases are both expected answers, not errors.
 */
async function get(url, { accept, binary = false } = {}) {
  const response = await fetch(url, { headers: headers(accept) });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GET ${url} → ${response.status} ${body.slice(0, 200)}`);
  }
  if (binary) return Buffer.from(await response.arrayBuffer());
  const text = await response.text();
  return accept === "application/json" || !accept ? safeJson(text) ?? text : text;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Every repository in the organization, following pagination. */
async function listRepos() {
  const repos = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await get(
      `${API}/orgs/${ORG}/repos?per_page=100&type=public&page=${page}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((repo) => !repo.archived && !NEVER_A_TOOL.has(repo.name));
}

/** A file at the default branch's HEAD, raw. */
async function rawFile(repo, path) {
  const url = `https://raw.githubusercontent.com/${ORG}/${repo.name}/${repo.default_branch}/${path}`;
  const response = await fetch(url, { headers: headers("*/*") });
  if (!response.ok) return null;
  return response;
}

/**
 * The checksums.txt a release ships, as { assetName: sha256 }. GoReleaser
 * writes "<sum>  <name>" lines, which is what sha256sum -c reads.
 */
async function parseChecksums(asset) {
  if (!asset) return {};
  const response = await fetch(asset.browser_download_url, { headers: headers("*/*") });
  if (!response.ok) return {};
  const text = await response.text();
  const sums = {};
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(\S+)$/i);
    if (match) sums[match[2]] = match[1].toLowerCase();
  }
  return sums;
}

/** The latest published release, or null when the tool has never shipped. */
async function latestRelease(repo) {
  const release = await get(`${API}/repos/${ORG}/${repo.name}/releases/latest`);
  if (!release || release.draft) return null;

  const checksumAsset = (release.assets ?? []).find((a) => a.name === "checksums.txt");
  const sums = await parseChecksums(checksumAsset);

  return {
    tag: release.tag_name,
    version: release.tag_name.replace(/^v/, ""),
    name: release.name ?? release.tag_name,
    publishedAt: release.published_at,
    url: release.html_url,
    notes: release.body ?? "",
    assets: (release.assets ?? []).map((asset) => ({
      name: asset.name,
      size: asset.size,
      downloadCount: asset.download_count,
      url: asset.browser_download_url,
      sha256: sums[asset.name] ?? null,
    })),
  };
}

/** The releases behind the latest one, for the changelog list. */
async function releaseHistory(repo, limit = 10) {
  const releases = await get(`${API}/repos/${ORG}/${repo.name}/releases?per_page=${limit}`);
  if (!Array.isArray(releases)) return [];
  return releases
    .filter((release) => !release.draft)
    .map((release) => ({
      tag: release.tag_name,
      name: release.name ?? release.tag_name,
      publishedAt: release.published_at,
      url: release.html_url,
      notes: release.body ?? "",
    }));
}

/**
 * Copy one repository-relative image into public/tools/<tool>/, and answer
 * with the site path. Returns null when the manifest points at something the
 * repository does not actually have, so a typo degrades to a missing image
 * rather than a broken build.
 */
async function copyImage(repo, toolName, path) {
  if (!path) return null;
  const response = await rawFile(repo, path);
  if (!response) {
    console.warn(`  ! ${toolName}: ${path} is not in the repository`);
    return null;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = path.split("/").pop();
  const dir = join(ASSET_ROOT, toolName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), bytes);
  return `/tools/${toolName}/${fileName}`;
}

/** Fill {version} and {arch} the way the manifest documents them. */
function expand(text, version, arch) {
  if (typeof text !== "string") return text;
  return text.replaceAll("{version}", version ?? "0.0.0").replaceAll("{arch}", arch);
}

/**
 * Turn the manifest's install block into what the page renders: one entry per
 * package manager, in display order, with the commands already expanded.
 */
function buildInstall(manifest, release) {
  const order = [
    ["pacman", "Arch Linux", "pacman"],
    ["aur", "Arch Linux (AUR)", "AUR helper"],
    ["apt", "Debian / Ubuntu", "apt"],
    ["dnf", "Fedora / RHEL", "dnf"],
    ["zypper", "openSUSE", "zypper"],
    ["binary", "Static binary", "tar.gz"],
    ["source", "From source", "go build"],
  ];
  const version = release?.version ?? null;

  const entries = [];
  for (const [id, label, manager] of order) {
    const method = manifest.install?.[id];
    if (!method) continue;
    entries.push({
      id,
      label,
      manager,
      available: method.available === true,
      package: method.package ?? manifest.name,
      repo: method.repo ?? null,
      requiresRepoSetup: method.requires_repo_setup === true,
      note: method.note ?? null,
      url: method.url ?? null,
      // The binary channel differs per architecture, so it carries a command
      // per arch; every other manager is architecture-independent.
      commands:
        id === "binary"
          ? ARCHES.map((arch) => ({
              arch,
              command: expand(method.command, version, arch),
              asset: method.pattern ? expand(method.pattern, version, arch) : null,
            }))
          : [{ arch: null, command: expand(method.command, version, "amd64"), asset: null }],
    });
  }
  return entries;
}

/** The one-line install a card shows: the first channel that works today. */
function headlineInstall(entries) {
  const ready = entries.find((entry) => entry.available && entry.id !== "source");
  const fallback = entries.find((entry) => entry.available);
  const chosen = ready ?? fallback ?? entries[0];
  if (!chosen) return null;
  return {
    label: chosen.label,
    available: chosen.available,
    command: chosen.commands[0].command.split("\n")[0],
  };
}

async function buildTool(repo) {
  const response = await rawFile(repo, "tool.json");
  if (!response) return null;

  const manifest = safeJson(await response.text());
  if (!manifest || manifest.name !== repo.name) {
    console.warn(`  ! ${repo.name}: tool.json is unreadable or names another tool`);
    return null;
  }

  console.log(`  · ${repo.name}`);

  const [release, history] = await Promise.all([
    latestRelease(repo),
    releaseHistory(repo),
  ]);

  const icon = await copyImage(repo, manifest.name, manifest.icon);
  const screenshots = [];
  for (const shot of manifest.screenshots ?? []) {
    const src = await copyImage(repo, manifest.name, shot.path);
    if (src) screenshots.push({ src, caption: shot.caption });
  }

  const install = buildInstall(manifest, release);

  return {
    name: manifest.name,
    binary: manifest.binary,
    tagline: manifest.tagline,
    description: manifest.description,
    category: manifest.category,
    homepage: manifest.homepage,
    repo: manifest.repo,
    license: manifest.license,
    platforms: manifest.platforms,
    keys: manifest.keys ?? [],
    keywords: manifest.keywords ?? [],
    maintainers: manifest.maintainers ?? [],
    since: manifest.since,
    security: manifest.security,
    stars: repo.stargazers_count ?? 0,
    topics: repo.topics ?? [],
    icon,
    screenshots,
    install,
    headline: headlineInstall(install),
    release,
    history,
    unreleased: manifest.unreleased === true || release === null,
  };
}

async function main() {
  console.log(`building the catalog from the ${ORG} organization`);
  if (!token) console.log("  (no GITHUB_TOKEN: anonymous rate limits apply)");

  // Downloaded assets are rebuilt from scratch so a screenshot removed from a
  // manifest stops being served.
  await rm(ASSET_ROOT, { recursive: true, force: true });
  await mkdir(ASSET_ROOT, { recursive: true });

  const repos = await listRepos();
  console.log(`  ${repos.length} repositories to check`);

  const tools = [];
  for (const repo of repos) {
    const tool = await buildTool(repo);
    if (tool) tools.push(tool);
  }

  // Released tools first, then the rest, alphabetically inside each group, so
  // the grid opens on something a reader can install.
  tools.sort((a, b) => {
    if (a.unreleased !== b.unreleased) return a.unreleased ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const catalog = {
    generatedAt: new Date().toISOString(),
    org: ORG,
    tools,
    categories: [...new Set(tools.map((tool) => tool.category))].sort(),
  };

  await mkdir(dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`wrote ${OUT_JSON}: ${tools.length} tools`);

  // The sitemap is generated here rather than committed, for the same reason
  // the catalog is: a new tool must not need an edit to this repository.
  const base = (process.env.SITE_URL ?? "https://tui-tools.github.io").replace(/\/$/, "");
  const paths = [
    "/",
    "/install/",
    "/security/",
    "/kit/",
    ...tools.map((tool) => `/tools/${tool.name}/`),
  ];
  await writeFile(
    join(ROOT, "public/sitemap.txt"),
    `${paths.map((path) => base + path).join("\n")}\n`,
  );
}

await main().catch(async (error) => {
  console.error(error.message);
  // A rate-limited or offline run must not blow away a catalog that is already
  // on disk: keep the previous one and let the build carry on with it.
  const existing = await readFile(OUT_JSON, "utf8").catch(() => null);
  if (existing) {
    console.error("keeping the catalog already on disk");
    process.exit(0);
  }
  process.exit(1);
});
