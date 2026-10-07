// Projects outside the family that may suit a reader better than a tool, written
// by hand. Nothing generates this: whether another project fits a job better is
// an editorial judgement, so it lives in one reviewable place and the tool page
// reads it from here rather than each page restating it.
//
// Keep the tone neutral. An entry says when the other project fits, not why the
// tool falls short, and it never ranks anyone's work. A project from the same
// author as this family says so in `disclosure`, on the page, every time.

const sambaConductor = {
  name: "Samba Conductor",
  url: "https://openbasalt.org/projects/samba-conductor/",
  summary:
    "a web console, self-service portal and single sign-on for a Samba Active Directory domain, from the OpenBasalt project. It is a pre-release at the time of writing.",
  fits: [
    "a web console, for administrators who would rather manage the domain from a browser",
    "an OpenID Connect provider and a SAML 2.0 identity provider backed by the domain accounts",
    "Google Workspace sync, or a one-time import of the users and groups of an existing Google Workspace",
    "a self-service portal where people in the domain manage their own account",
  ],
  disclosure: "Samba Conductor comes from the same author as tui-tools.",
};

export const related = {
  "tui-dc": {
    lead: "tui-dc administers a Samba Active Directory domain from a terminal, one previewed samba-tool command at a time. Another project may fit better when you want:",
    projects: [sambaConductor],
  },
  "tui-samba": {
    lead: "tui-samba covers Samba as a file server. If the machine is, or will be, a Samba Active Directory domain controller, another project may fit better when you want:",
    projects: [sambaConductor],
  },
};

// relatedFor returns the entry for a tool, or null when there is none.
export function relatedFor({ name }) {
  return related[name] ?? null;
}
