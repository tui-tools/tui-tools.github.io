// The family's support commitment, written by hand — unlike catalog.json and
// scorecard.json in this directory, nothing generates this. It is a policy
// decision, not a fact scraped from a release, so it lives in one reviewable
// place and the pages that show it read from here rather than restating it.
//
// The commitment is deliberately narrow: for a versioned distribution the
// family supports the two most recent stable releases, and no older. A rolling
// distribution has no "previous release" to name, so the commitment there is
// simply the current state of the distribution on the day you install.
//
// This says which releases the family keeps working on. It does NOT claim every
// tool has been exercised on every one of them — the evidence of an actual test
// run lives per tool, in each tool's `tested` versions on its own page, and is
// generated from real runs. This page states the promise; the tool pages carry
// the proof.

// versioned: distributions that ship numbered releases. `releases` lists the
// two the family commits to, newest first; `current` is the newest.
export const versioned = [
  {
    id: "ubuntu",
    label: "Ubuntu",
    releases: ["26.04 LTS", "24.04 LTS"],
    note: "The two most recent LTS releases.",
  },
  {
    id: "fedora",
    label: "Fedora",
    releases: ["43", "42"],
    note: "The two releases Fedora itself still maintains.",
  },
  {
    id: "debian",
    label: "Debian",
    releases: ["13 (trixie)", "12 (bookworm)"],
    note: "Stable and oldstable.",
  },
];

// rolling: distributions with no release number to pin. The commitment is the
// current state, refreshed as the distribution moves.
export const rolling = [
  {
    id: "omarchy-server",
    label: "Omarchy Server",
    note: "Rolling; the family tracks the current state of the distribution.",
  },
];

// policy is the one-paragraph statement of the rule, so a page can show the
// words without hardcoding them in its markup.
export const policy =
  "For a distribution that ships numbered releases, the family supports the two most recent stable releases and drops support for a release when it falls out of that window. A rolling distribution has no previous release to name, so support there means the current state of the distribution on the day you install. Older releases are not blocked and often work; they are simply outside what the family tests and commits to.";

export default { versioned, rolling, policy };
