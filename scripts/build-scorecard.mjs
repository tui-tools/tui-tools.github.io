#!/usr/bin/env node
/**
 * Build src/data/scorecard.json: the published OpenSSF Scorecard result for
 * every repository the site talks about.
 *
 * The set is the catalog's tools plus the two repositories that carry no
 * tool.json and are therefore not in the marketplace: tui-kit, which every
 * tool is built on, and tui-tools, the launcher. The catalog has to exist
 * first, so this runs after scripts/build-catalog.mjs in the same npm step.
 *
 * The API only knows a repository once the weekly workflow has run and the
 * result has been indexed, so a 404 is an ordinary answer, not a failure: the
 * repository is recorded as pending and the page says so. Timeouts, an API
 * that is down and a body that does not parse are all pending too. This script
 * never fails the build — a security panel that cannot be built is worse than
 * one that is honest about what it does not know yet. A run where the API is
 * down therefore shows every repository as pending, which is the truthful
 * answer: this build has no result for any of them.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORG = process.env.TUI_ORG ?? "tui-tools";
const CATALOG_JSON = join(ROOT, "src/data/catalog.json");
const OUT_JSON = join(ROOT, "src/data/scorecard.json");
const API = "https://api.securityscorecards.dev/projects/github.com";

/** Repositories the catalog cannot know about: they carry no tool.json. */
const EXTRA_REPOS = ["tui-kit", ORG];

/** How long one repository is given before it counts as pending. */
const TIMEOUT_MS = Number(process.env.TUI_SCORECARD_TIMEOUT ?? 15000);

function badgeUrl(repo) {
  return `${API}/${ORG}/${repo}/badge`;
}

function viewerUrl(repo) {
  return `https://scorecard.dev/viewer/?uri=github.com/${ORG}/${repo}`;
}

/** The repositories to ask about, deduplicated and in display order. */
async function repoNames() {
  const raw = await readFile(CATALOG_JSON, "utf8").catch(() => null);
  const tools = raw
    ? (JSON.parse(raw).tools ?? []).map((tool) => tool.name)
    : [];
  if (!raw) {
    console.warn("  ! no catalog on disk: only the kit and the launcher are checked");
  }
  return [...new Set([...tools, ...EXTRA_REPOS])].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * One repository's result. Every failure mode answers the same way — pending,
 * with the reason kept for the build log — so the caller has nothing to catch.
 */
async function fetchResult(repo) {
  const base = { repo, badge: badgeUrl(repo), viewer: viewerUrl(repo) };
  let response;
  try {
    response = await fetch(`${API}/${ORG}/${repo}`, {
      headers: { Accept: "application/json", "User-Agent": `${ORG}-site-scorecard` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.log(`  · ${repo}: pending (${error.name})`);
    return { ...base, status: "pending", reason: error.name };
  }

  if (!response.ok) {
    // 404 is the normal answer for a repository the weekly run has not been
    // indexed for yet; anything else is recorded the same way on purpose.
    console.log(`  · ${repo}: pending (HTTP ${response.status})`);
    return { ...base, status: "pending", reason: `HTTP ${response.status}` };
  }

  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    console.log(`  · ${repo}: pending (unreadable body)`);
    return { ...base, status: "pending", reason: "unreadable body" };
  }

  if (typeof payload?.score !== "number") {
    console.log(`  · ${repo}: pending (no score in the answer)`);
    return { ...base, status: "pending", reason: "no score" };
  }

  const checks = (payload.checks ?? [])
    .filter((check) => check && typeof check.name === "string")
    .map((check) => ({
      name: check.name,
      // -1 is Scorecard's "this check could not run here", not a zero.
      score: typeof check.score === "number" ? check.score : -1,
      reason: check.reason ?? null,
    }));

  console.log(`  · ${repo}: ${payload.score} (${checks.length} checks)`);
  return {
    ...base,
    status: "published",
    score: payload.score,
    date: payload.date ?? null,
    commit: payload.repo?.commit ?? null,
    checks,
  };
}

async function main() {
  console.log("reading the OpenSSF Scorecard results");
  const repos = await repoNames();

  const results = [];
  for (const repo of repos) {
    results.push(await fetchResult(repo));
  }

  const published = results.filter((result) => result.status === "published");
  const data = {
    generatedAt: new Date().toISOString(),
    org: ORG,
    source: API,
    results,
  };

  await mkdir(dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `wrote ${OUT_JSON}: ${published.length} published, ${results.length - published.length} pending`,
  );
}

// Nothing here is allowed to stop a build. Whatever went wrong, the file on
// disk is either the one an earlier run wrote or a complete set of pending
// rows, so the page always has something truthful to render.
await main().catch(async (error) => {
  console.error(`scorecard: ${error.message}`);
  const existing = await readFile(OUT_JSON, "utf8").catch(() => null);
  if (existing) {
    console.error("keeping the scorecard results already on disk");
    process.exit(0);
  }
  await mkdir(dirname(OUT_JSON), { recursive: true }).catch(() => {});
  await writeFile(
    OUT_JSON,
    `${JSON.stringify(
      { generatedAt: new Date().toISOString(), org: ORG, source: API, results: [] },
      null,
      2,
    )}\n`,
  ).catch(() => {});
  process.exit(0);
});
