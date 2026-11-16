/**
 * The one-time repository setup, by hand, per package manager.
 *
 * These are the same lines pkgs.tui.tools prints under "Or set it up by hand"
 * (manual_steps in pkgs' scripts/render-index.py), one shell line per step, so
 * a reader who compares the two finds them identical. Each block starts the
 * way install.sh does: the key is downloaded to a private temporary file and
 * checked to hold exactly one primary key with the pinned fingerprint. The
 * check prints "key OK" or removes the file, so a reader who pastes the rest
 * anyway has nothing for the following steps to trust. Only then is the
 * checked file handed to the package manager.
 *
 * dnf's .repo file is written here, naming that checked local file, rather
 * than downloaded with a key URL in it: the file that says which key to trust
 * should not arrive over the network. dnf then asks to import the key for the
 * repository index, and the reader answers it (there is no -y), comparing the
 * fingerprint it shows with KEY_FINGERPRINT.
 *
 * Kept in its own module, with no network and no side effects, so the test
 * next to it can import it.
 */

/**
 * The family's repository signing key, pinned the way pkgs/install.sh pins it
 * (KEY_FPR there) and tui-kit's render-install.py pins it (KEY_FINGERPRINT).
 * A new key means a new value here, as it means a new install.sh.
 */
export const KEY_FINGERPRINT = "767CFB337B01F32FFC073F3F389120B277E4FB44";

/** The apt suite and component pkgs publishes. */
const SUITE = "stable";
const COMPONENT = "main";

/**
 * Prints the primary key fingerprints in a `gpg --show-keys --with-colons`
 * listing, one per line: the `fpr` record right after each `pub`, never a
 * subkey's. The same awk program install.sh runs.
 */
const PRIMARY_FPRS_AWK =
  "awk -F: '$1 == \"pub\" { p = 1; next } p && $1 == \"fpr\" { print $10; p = 0 }'";

/** Where dnf is told the checked key lives. */
const RPM_KEY = "/etc/pki/rpm-gpg/RPM-GPG-KEY-tui-tools";

/** The download-and-check lines every block starts with. */
function keyCheck(repo, fingerprint) {
  const curl = repo.startsWith("https://")
    ? "curl -fsSL --proto =https --tlsv1.2"
    : "curl -fsSL";
  return [
    'k="$(mktemp -d)/tui-tools.asc"',
    `${curl} -o "$k" ${repo}/pubkey.asc`,
    `[ "$(gpg --show-keys --with-colons "$k" | ${PRIMARY_FPRS_AWK})" = ${fingerprint} ]` +
      ' && echo "key OK" || { echo "WRONG KEY: stop here"; rm -f "$k"; }',
  ];
}

/**
 * The setup lines per package manager for a repository URL, as arrays of shell
 * lines.
 */
export function manualSteps(repo, fingerprint = KEY_FINGERPRINT) {
  const fpr = fingerprint.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(fpr)) {
    throw new Error("manual setup: the key fingerprint is not 40 hexadecimal digits");
  }
  const check = keyCheck(repo, fpr);
  const repoLines = [
    "[tui-tools]",
    "name=tui-tools",
    `baseurl=${repo}/rpm/$basearch`,
    "enabled=1",
    "gpgcheck=1",
    "repo_gpgcheck=1",
    `gpgkey=file://${RPM_KEY}`,
    "metadata_expire=1h",
  ]
    .map((line) => `'${line}'`)
    .join(" ");
  return {
    apt: [
      ...check,
      "sudo install -d -m 0755 /etc/apt/keyrings",
      'sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/tui-tools.gpg "$k"',
      `echo "deb [signed-by=/etc/apt/keyrings/tui-tools.gpg] ${repo}/deb ${SUITE} ${COMPONENT}"` +
        " | sudo tee /etc/apt/sources.list.d/tui-tools.list",
      "sudo apt-get update",
    ],
    dnf: [
      ...check,
      "sudo install -d -m 0755 /etc/pki/rpm-gpg",
      `sudo install -m 0644 "$k" ${RPM_KEY}`,
      `sudo rpm --import ${RPM_KEY}`,
      `printf '%s\\n' ${repoLines} | sudo tee /etc/yum.repos.d/tui-tools.repo`,
      "sudo dnf makecache --repo tui-tools",
    ],
    pacman: [
      ...check,
      'sudo pacman-key --add "$k"',
      `sudo pacman-key --lsign-key ${fpr}`,
      `printf '[tui-tools]\\nServer = ${repo}/arch/$arch\\n' | sudo tee -a /etc/pacman.conf`,
      "sudo pacman -Sy",
    ],
  };
}

/**
 * The same setup as the text block a page renders, keyed by the manager id
 * the manifests use (apt, dnf, pacman).
 */
export const MANUAL_SETUP = Object.fromEntries(
  ["apt", "dnf", "pacman"].map((id) => [
    id,
    (repo) => manualSteps(repo)[id].join("\n"),
  ]),
);
