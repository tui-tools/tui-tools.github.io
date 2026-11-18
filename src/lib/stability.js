/**
 * Stability, as each tool's manifest states it and scripts/build-catalog.mjs
 * carries it into the catalog. Every tool starts beta and leaves beta on its
 * own, once, when it meets the bar tui-kit documents. Every page that names
 * stable tools, and every place that says where the family stands, asks this
 * module, so none of them lists a tool or counts tools by hand.
 */

/** The bar a tool is measured against, and what "stable" promises. */
export const STABILITY_DOC = "https://github.com/tui-tools/tui-kit/blob/main/docs/stability.md";

/**
 * The launcher. It is the family's front door and lists the tools rather than
 * being one of them, so it is not counted when the site says how many tools are
 * stable. Its own page and chip still show its own state.
 */
export const LAUNCHER = "tui-tools";

/** True when the catalog entry is a stable tool with the release it became stable at. */
export const isStable = (tool) => tool?.stability === "stable" && Boolean(tool.stableSince);

/** The stable tools, by name, for a page that names them. */
export function stableTools(catalog) {
  return (catalog.tools ?? [])
    .filter(isStable)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => ({ name: tool.name, since: tool.stableSince }));
}

/**
 * The three states the family can be in, from the share of its tools that are
 * stable:
 *
 * - "beta": half of the tools or fewer are stable. The site keeps the beta
 *   banner and its sentence word for word.
 * - "mostly-stable": more than half are stable. The site states where the
 *   family stands, as a status line rather than a warning, and names the tools
 *   that are still beta.
 * - "stable": every tool is stable. There is nothing left to warn about.
 */
export const FAMILY_STATES = Object.freeze({
  BETA: "beta",
  MOSTLY_STABLE: "mostly-stable",
  STABLE: "stable",
});

/** The sentence the family carried while it was mostly beta, word for word. */
export const BETA_NOTICE =
  "Beta tools may still change keys, flags or output before their 1.0; stable tools follow semver. Pin versions, and report what breaks.";

/**
 * The tools the family counts: released, and not the launcher. A tool with no
 * release yet (the template, a tool still being built) has no version that
 * could be stable, so counting it would only hold the family back for a tool a
 * reader cannot install.
 */
export const countedTools = (catalog) =>
  (catalog?.tools ?? []).filter(
    (tool) => tool.unreleased !== true && tool.name !== LAUNCHER,
  );

/**
 * Where the family stands, computed from the catalog: how many tools it
 * counts, which of them are stable, which are still beta, and the state that
 * follows. Exactly half stable is still "beta"; one more makes it
 * "mostly-stable".
 */
export function familyStatus(catalog) {
  const counted = countedTools(catalog)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const stable = counted
    .filter(isStable)
    .map((tool) => ({ name: tool.name, since: tool.stableSince }));
  const beta = counted.filter((tool) => !isStable(tool)).map((tool) => ({ name: tool.name }));
  const total = counted.length;

  let state = FAMILY_STATES.BETA;
  if (total > 0 && stable.length === total) state = FAMILY_STATES.STABLE;
  else if (stable.length * 2 > total) state = FAMILY_STATES.MOSTLY_STABLE;

  return { state, total, stable, beta };
}

/**
 * The family's canonical sentence for a status from familyStatus(). The banner,
 * the install page and `family.notice` in /catalog.json all say this one
 * sentence, so they cannot drift apart. It is empty when every tool is stable:
 * there is no notice left to give.
 */
export function familyNotice({ state, total, stable, beta }) {
  if (state === FAMILY_STATES.STABLE) return "";
  if (state === FAMILY_STATES.BETA) return BETA_NOTICE;
  const rest =
    beta.length === 1
      ? "the other one is still beta and may change keys, flags or output before its 1.0."
      : `the other ${beta.length} are still beta and may change keys, flags or output before their 1.0.`;
  return `${stable.length} of ${total} tools are stable and follow semver; ${rest}`;
}
