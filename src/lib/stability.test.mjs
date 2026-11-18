// Tests for where the family stands, as the site-wide line, the install page
// and `family.notice` in /catalog.json say it. Run with `npm test`
// (node --test). No network, no build.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BETA_NOTICE,
  FAMILY_STATES,
  LAUNCHER,
  countedTools,
  familyNotice,
  familyStatus,
} from "./stability.js";

/** A catalog of `total` released tools, the first `stable` of them stable. */
function catalogOf({ total, stable }) {
  const tools = Array.from({ length: total }, (_, index) => {
    const name = `tui-${String.fromCharCode(97 + index)}`;
    return index < stable
      ? { name, stability: "stable", stableSince: "1.0.0" }
      : { name, stability: "beta", stableSince: null };
  });
  // The launcher and an unreleased tool are always present and never counted.
  tools.push({ name: LAUNCHER, stability: "beta", stableSince: null });
  tools.push({ name: "tui-template", unreleased: true, stability: "beta", stableSince: null });
  return { tools };
}

test("the launcher and unreleased tools are not counted", () => {
  const names = countedTools(catalogOf({ total: 3, stable: 1 })).map((tool) => tool.name);
  assert.deepEqual(names, ["tui-a", "tui-b", "tui-c"]);
});

test("half or fewer stable keeps the beta sentence word for word", () => {
  for (const stable of [0, 1, 5]) {
    const status = familyStatus(catalogOf({ total: 19, stable }));
    assert.equal(status.state, FAMILY_STATES.BETA, `${stable} of 19`);
    assert.equal(familyNotice(status), BETA_NOTICE);
  }
  assert.equal(
    BETA_NOTICE,
    "Beta tools may still change keys, flags or output before their 1.0; stable tools follow semver. Pin versions, and report what breaks.",
  );
});

test("exactly half stable is still beta; one more flips it", () => {
  const half = familyStatus(catalogOf({ total: 10, stable: 5 }));
  assert.equal(half.state, FAMILY_STATES.BETA);
  assert.equal(familyNotice(half), BETA_NOTICE);

  const oneMore = familyStatus(catalogOf({ total: 10, stable: 6 }));
  assert.equal(oneMore.state, FAMILY_STATES.MOSTLY_STABLE);

  // With an odd count, half rounds down: 9 of 19 is beta, 10 of 19 is not.
  assert.equal(familyStatus(catalogOf({ total: 19, stable: 9 })).state, FAMILY_STATES.BETA);
  assert.equal(
    familyStatus(catalogOf({ total: 19, stable: 10 })).state,
    FAMILY_STATES.MOSTLY_STABLE,
  );
});

test("more than half stable gives the status sentence and names the beta tools", () => {
  const status = familyStatus(catalogOf({ total: 19, stable: 11 }));
  assert.equal(status.state, FAMILY_STATES.MOSTLY_STABLE);
  assert.equal(status.total, 19);
  assert.equal(status.stable.length, 11);
  assert.deepEqual(
    status.beta.map((tool) => tool.name),
    ["tui-l", "tui-m", "tui-n", "tui-o", "tui-p", "tui-q", "tui-r", "tui-s"],
  );
  assert.equal(
    familyNotice(status),
    "11 of 19 tools are stable and follow semver; the other 8 are still beta and may change keys, flags or output before their 1.0.",
  );
});

test("one beta tool left is named in the singular", () => {
  const status = familyStatus(catalogOf({ total: 19, stable: 18 }));
  assert.equal(status.state, FAMILY_STATES.MOSTLY_STABLE);
  assert.equal(
    familyNotice(status),
    "18 of 19 tools are stable and follow semver; the other one is still beta and may change keys, flags or output before its 1.0.",
  );
});

test("every tool stable leaves no notice", () => {
  const status = familyStatus(catalogOf({ total: 19, stable: 19 }));
  assert.equal(status.state, FAMILY_STATES.STABLE);
  assert.deepEqual(status.beta, []);
  assert.equal(familyNotice(status), "");
});

test("a stable manifest without stableSince counts as beta", () => {
  const catalog = {
    tools: [
      { name: "tui-a", stability: "stable", stableSince: "1.0.0" },
      { name: "tui-b", stability: "stable", stableSince: null },
    ],
  };
  const status = familyStatus(catalog);
  assert.equal(status.state, FAMILY_STATES.BETA);
  assert.deepEqual(status.beta, [{ name: "tui-b" }]);
});

test("an empty catalog is beta, not stable", () => {
  const status = familyStatus({ tools: [] });
  assert.equal(status.state, FAMILY_STATES.BETA);
  assert.equal(familyNotice(status), BETA_NOTICE);
});
