// Tests for the by-hand repository setup the site prints. Run with
// `npm test` (node --test). No network, no build.
import assert from "node:assert/strict";
import { test } from "node:test";

import { KEY_FINGERPRINT, MANUAL_SETUP, manualSteps } from "./manual-setup.mjs";

const REPO = "https://pkgs.tui.tools";

// The key check pkgs.tui.tools prints, verbatim (manual_steps in pkgs'
// scripts/render-index.py). If pkgs changes it, this test is where the site
// finds out it has to follow.
const PKGS_KEY_CHECK = [
  'k="$(mktemp -d)/tui-tools.asc"',
  'curl -fsSL --proto =https --tlsv1.2 -o "$k" https://pkgs.tui.tools/pubkey.asc',
  `[ "$(gpg --show-keys --with-colons "$k" | awk -F: '$1 == "pub" { p = 1; next } p && $1 == "fpr" { print $10; p = 0 }')" = 767CFB337B01F32FFC073F3F389120B277E4FB44 ] && echo "key OK" || { echo "WRONG KEY: stop here"; rm -f "$k"; }`,
];

test("every block checks the key against the pinned fingerprint first", () => {
  const steps = manualSteps(REPO);
  for (const id of ["apt", "dnf", "pacman"]) {
    assert.deepEqual(steps[id].slice(0, 3), PKGS_KEY_CHECK, id);
    // Nothing reads the key from the network after the check: every later
    // step uses the checked temporary file or the fingerprint.
    for (const line of steps[id].slice(3)) {
      assert.ok(!line.includes("pubkey.asc"), `${id}: ${line}`);
    }
  }
});

test("the blocks are the ones pkgs.tui.tools prints", () => {
  const steps = manualSteps(REPO);
  assert.deepEqual(steps.apt.slice(3), [
    "sudo install -d -m 0755 /etc/apt/keyrings",
    'sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/tui-tools.gpg "$k"',
    'echo "deb [signed-by=/etc/apt/keyrings/tui-tools.gpg] https://pkgs.tui.tools/deb stable main" | sudo tee /etc/apt/sources.list.d/tui-tools.list',
    "sudo apt-get update",
  ]);
  assert.deepEqual(steps.dnf.slice(3), [
    "sudo install -d -m 0755 /etc/pki/rpm-gpg",
    'sudo install -m 0644 "$k" /etc/pki/rpm-gpg/RPM-GPG-KEY-tui-tools',
    "sudo rpm --import /etc/pki/rpm-gpg/RPM-GPG-KEY-tui-tools",
    "printf '%s\\n' '[tui-tools]' 'name=tui-tools' 'baseurl=https://pkgs.tui.tools/rpm/$basearch' 'enabled=1' 'gpgcheck=1' 'repo_gpgcheck=1' 'gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-tui-tools' 'metadata_expire=1h' | sudo tee /etc/yum.repos.d/tui-tools.repo",
    "sudo dnf makecache --repo tui-tools",
  ]);
  assert.deepEqual(steps.pacman.slice(3), [
    'sudo pacman-key --add "$k"',
    "sudo pacman-key --lsign-key 767CFB337B01F32FFC073F3F389120B277E4FB44",
    "printf '[tui-tools]\\nServer = https://pkgs.tui.tools/arch/$arch\\n' | sudo tee -a /etc/pacman.conf",
    "sudo pacman -Sy",
  ]);
});

test("dnf is never told to answer its own key question", () => {
  const dnf = manualSteps(REPO).dnf.join("\n");
  assert.ok(!/(^|\s)-y(\s|$)/.test(dnf));
  assert.ok(!dnf.includes("--assumeyes"));
  // The .repo file is written locally, never downloaded with a key URL in it.
  assert.ok(!/curl[^\n]*yum\.repos\.d/.test(dnf));
});

test("the rendered text is the steps, one per line", () => {
  for (const id of ["apt", "dnf", "pacman"]) {
    assert.equal(MANUAL_SETUP[id](REPO), manualSteps(REPO)[id].join("\n"));
  }
});

test("a fingerprint that is not 40 hex digits is refused", () => {
  assert.throws(() => manualSteps(REPO, "767CFB33"));
  assert.throws(() => manualSteps(REPO, `${KEY_FINGERPRINT.slice(0, 39)}Z`));
  // Spaces and case are normalised the way gpg prints it.
  const spaced = KEY_FINGERPRINT.toLowerCase().replace(/(.{4})/g, "$1 ");
  assert.deepEqual(manualSteps(REPO, spaced), manualSteps(REPO));
});

test("a plain-http repository (a local build) gets plain curl", () => {
  const apt = manualSteps("http://127.0.0.1:8080").apt;
  assert.equal(apt[1], 'curl -fsSL -o "$k" http://127.0.0.1:8080/pubkey.asc');
});
