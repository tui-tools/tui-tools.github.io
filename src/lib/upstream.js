// The upstream projects a tool drives, read from the backends its tool.json
// declares. Used by the maintainers invitation on /about and the one-line
// pointer on each tool page, so both always name the same projects.

// A few backend ids are slugs of a project whose real name has a character a
// slug cannot hold. Show the name the project uses for itself.
const DISPLAY_NAMES = {
  "acme-sh": "acme.sh",
};

export function upstreamNames({ tool }) {
  const names = (tool.backends ?? []).map(
    (backend) => DISPLAY_NAMES[backend.name] ?? backend.name,
  );
  return [...new Set(names)];
}

// "ufw", "ufw or nftables", "ufw, firewalld or nftables".
export function joinWithOr({ names }) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

// The tools that front at least one upstream project. The template is where a
// new tool starts, not a tool in front of anyone's project, so it is left out.
export function toolsWithUpstreams({ tools }) {
  return tools
    .filter((tool) => tool.category !== "template")
    .map((tool) => ({ name: tool.name, upstreams: upstreamNames({ tool }) }))
    .filter((entry) => entry.upstreams.length > 0);
}
