/**
 * Stability, as each tool's manifest states it and scripts/build-catalog.mjs
 * carries it into the catalog. The family is beta; a tool leaves beta on its
 * own, once, when it meets the bar tui-kit documents. Every page that names
 * stable tools asks this module, so none of them lists a tool by hand.
 */

/** The bar a tool is measured against, and what "stable" promises. */
export const STABILITY_DOC = "https://github.com/tui-tools/tui-kit/blob/main/docs/stability.md";

/** True when the catalog entry is a stable tool with the release it became stable at. */
export const isStable = (tool) => tool?.stability === "stable" && Boolean(tool.stableSince);

/** The stable tools, by name, for a page that names them. */
export function stableTools(catalog) {
  return (catalog.tools ?? [])
    .filter(isStable)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => ({ name: tool.name, since: tool.stableSince }));
}
