#!/usr/bin/env node
/**
 * Render the link previews served at /og/<slug>.png.
 *
 * A link to this site is mostly shared into places that show a card: X, Slack,
 * LinkedIn, Discord. Those cards are the first — often the only — look anyone
 * gets, and a 256px app icon stretched into one says nothing. So every page
 * gets its own 1200x630 image, drawn here at build time in the same Tokyo
 * Night palette the site wears, and pointed at by `og:image` with
 * `twitter:card = summary_large_image`.
 *
 * Two kinds of card:
 *
 *   - the family card, for the grid, /install, /guides, /security, /kit and
 *     404, and for every guide, which shares the section's card: the
 *     brand mark, the wordmark, the page's own line, and the domain;
 *   - a tool card, for /tools/<name>: the prompt-prefixed tool name, the
 *     tagline out of its tool.json, and its first screenshot fitted on the
 *     right — the actual program, not an illustration of it.
 *
 * Everything is local. The screenshots are already on disk because
 * build-catalog.mjs downloaded them into public/tools/ a step earlier, and the
 * two typefaces come out of node_modules rather than a font CDN, so this runs
 * offline and renders the same bytes on a laptop and in the container.
 *
 * satori turns a plain element tree into SVG and @resvg/resvg-js rasterises
 * it. Both are pure npm packages with prebuilt binaries for linux x64/arm64,
 * musl included, which is what the node:22-alpine build stage needs.
 *
 * Run before `astro build` — public/og/ has to exist before Astro copies
 * public/ into dist/.
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/og");
const CATALOG = join(ROOT, "src/data/catalog.json");

const WIDTH = 1200;
const HEIGHT = 630;

// The same custom properties as src/styles/global.css, resolved: satori has no
// cascade, so every colour is written out.
const INK = "#1a1b26";
const PANEL = "#1f2335";
const FRAME = "#2f334d";
const FG = "#c0caf5";
const MUTED = "#565f89";
const FAMILY = "#9ece6a";
const TOOL = "#7aa2f7";

/** The pages that are not tools, and the line each one puts on its card. */
const PAGES = [
  {
    slug: "home",
    title: "tui-tools",
    line: "The command in the dialog is the command that runs",
  },
  {
    slug: "install",
    title: "Install",
    line: "Signed apt, dnf and pacman repositories, or one static binary",
  },
  {
    slug: "guides",
    title: "Guides",
    line: "Written after the work: real commands, real output, linked evidence",
  },
  {
    slug: "security",
    title: "Security",
    line: "Preview, then confirm. Read-only by default, and it runs as you",
  },
  {
    slug: "kit",
    title: "tui-kit",
    line: "The shared foundation every tui-tools tool is built on",
  },
];

// ------------------------------------------------------------------ fonts

/**
 * Mono for anything the machine would say, sans for anything we say — the
 * same split the site makes. fontsource ships woff, which satori reads
 * directly; woff2 it does not, so the .woff file is the one to take.
 */
async function loadFonts() {
  const file = (pkg, name) =>
    readFile(join(ROOT, "node_modules", pkg, "files", name));
  const [mono, monoBold, sans, sansBold] = await Promise.all([
    file("@fontsource/jetbrains-mono", "jetbrains-mono-latin-400-normal.woff"),
    file("@fontsource/jetbrains-mono", "jetbrains-mono-latin-700-normal.woff"),
    file("@fontsource/inter", "inter-latin-400-normal.woff"),
    file("@fontsource/inter", "inter-latin-600-normal.woff"),
  ]);
  return [
    { name: "JetBrains Mono", data: mono, weight: 400, style: "normal" },
    { name: "JetBrains Mono", data: monoBold, weight: 700, style: "normal" },
    { name: "Inter", data: sans, weight: 400, style: "normal" },
    { name: "Inter", data: sansBold, weight: 600, style: "normal" },
  ];
}

// ------------------------------------------------------------------ images

/**
 * A PNG's pixel size, read out of the IHDR chunk. Cheap enough that it is not
 * worth a dependency, and it is all the fitting below needs.
 */
function pngSize(bytes) {
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function dataUri(bytes, mime) {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** A file under public/, addressed the way the catalog addresses it. */
async function readPublic(path) {
  if (!path) return null;
  return readFile(join(ROOT, "public", path.replace(/^\//, ""))).catch(
    () => null,
  );
}

/**
 * The picture a tool card shows: its first screenshot, or its icon when the
 * screenshot is missing. Returned already scaled to fit the frame, because
 * satori's object-fit support is thinner than doing the arithmetic here.
 */
async function toolArtwork({ tool, boxWidth, boxHeight }) {
  const shot = tool.screenshots?.[0]?.src;
  const bytes = await readPublic(shot);
  if (bytes) {
    const size = pngSize(bytes);
    if (size) {
      const scale = Math.min(boxWidth / size.width, boxHeight / size.height);
      return {
        kind: "screenshot",
        src: dataUri(bytes, "image/png"),
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
      };
    }
  }

  // No screenshot in the manifest, or one that is not a PNG: the tool's own
  // icon stands in. It is square, so it is placed at a fixed size rather than
  // fitted, and it reads as a mark instead of a cropped window.
  const icon = await readPublic(tool.icon);
  if (!icon) return null;
  const side = Math.min(boxWidth, boxHeight, 320);
  return {
    kind: "icon",
    src: dataUri(icon, "image/svg+xml"),
    width: side,
    height: side,
  };
}

// ------------------------------------------------------------------ layout
//
// satori takes React elements; a plain { type, props } object is one, so the
// tree below is built without JSX and without a build step to strip it.

const h = (type, props = {}, ...children) => ({
  type,
  props: { ...props, children: children.flat().filter(Boolean) },
});

const text = (value, style) => h("div", { style }, value);

/** The rounded frame and hairline every card is drawn inside. */
function card(children, { accent }) {
  return h(
    "div",
    {
      style: {
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        background: INK,
        fontFamily: "Inter",
      },
    },
    // A thin accent rule along the top, the one place the card says whether it
    // is about the family (green) or about a single tool (blue).
    h("div", { style: { display: "flex", height: "8px", background: accent } }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: "56px 64px 48px",
        },
      },
      children,
    ),
  );
}

/** The masthead brand, drawn the same way the site's Masthead draws it. */
function brand({ mark, size = 56 }) {
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: "18px" } },
    mark
      ? h("img", { src: mark, width: size, height: size, style: { display: "flex" } })
      : null,
    h(
      "div",
      {
        style: {
          display: "flex",
          fontFamily: "JetBrains Mono",
          fontWeight: 700,
          fontSize: "56px",
          letterSpacing: "-0.02em",
        },
      },
      text("tui-", { display: "flex", color: FAMILY }),
      text("tools", { display: "flex", color: FG }),
    ),
  );
}

/** The domain, sitting on the baseline of every card. */
function footer(right) {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: "auto",
        fontFamily: "JetBrains Mono",
        fontSize: "24px",
        color: MUTED,
      },
    },
    text("tui.tools", { display: "flex", color: FAMILY }),
    right ? text(right, { display: "flex" }) : null,
  );
}

/**
 * The family card: brand, the page's line, and the domain. The home page uses
 * it with the family tagline; /install, /security and /kit swap the line for
 * their own title so the three do not share one indistinguishable image.
 */
function familyCard({ mark, title, line }) {
  const isHome = title === "tui-tools";
  return card(
    [
      // The block sits optically centred rather than pinned to the top: with
      // only three lines on it, a card anchored at the top leaves a third of
      // itself empty, and cropped previews cut the empty third in.
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
          },
        },
        brand({ mark }),
        isHome
          ? null
          : text(title, {
              display: "flex",
              marginTop: "40px",
              fontFamily: "JetBrains Mono",
              fontWeight: 700,
              fontSize: "84px",
              color: FG,
              letterSpacing: "-0.02em",
            }),
        text(line, {
          display: "flex",
          marginTop: isHome ? "44px" : "22px",
          maxWidth: "1000px",
          fontSize: isHome ? "52px" : "38px",
          lineHeight: 1.32,
          color: isHome ? FG : MUTED,
        }),
      ),
      footer(null),
    ],
    { accent: FAMILY },
  );
}

/**
 * A tool card: the tool named the way a prompt would name it, its tagline, and
 * the program itself on the right. The screenshot is what makes this worth
 * generating at all — the card shows the tool running.
 */
function toolCard({ mark, tool, artwork }) {
  return card(
    [
      h(
        "div",
        { style: { display: "flex", flexGrow: 1, gap: "32px", alignItems: "center" } },
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              width: "490px",
              flexShrink: 0,
            },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "16px",
                fontFamily: "JetBrains Mono",
                fontWeight: 700,
                fontSize: "48px",
                letterSpacing: "-0.02em",
              },
            },
            text(">_", { display: "flex", color: MUTED }),
            text(tool.name, { display: "flex", color: TOOL }),
          ),
          text(tool.tagline ?? "", {
            display: "flex",
            marginTop: "28px",
            fontSize: "32px",
            lineHeight: 1.4,
            color: FG,
          }),
        ),
        artwork
          ? h(
              "div",
              {
                style: {
                  display: "flex",
                  flexGrow: 1,
                  alignItems: "center",
                  justifyContent: "center",
                },
              },
              h("img", {
                src: artwork.src,
                width: artwork.width,
                height: artwork.height,
                style: {
                  display: "flex",
                  borderRadius: "10px",
                  ...(artwork.kind === "screenshot"
                    ? { border: `1px solid ${FRAME}`, background: PANEL }
                    : {}),
                },
              }),
            )
          : null,
      ),
      // The tool's category, opposite the domain: it is the one fact about the
      // tool the name and the tagline do not already carry.
      footer(tool.category ?? null),
    ],
    { accent: TOOL },
  );
}

// ------------------------------------------------------------------ render

async function renderPng({ element, fonts }) {
  const svg = await satori(element, { width: WIDTH, height: HEIGHT, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  return resvg.render().asPng();
}

async function main() {
  const fonts = await loadFonts();

  const markSvg = await readFile(join(ROOT, "public/brand/icon.svg")).catch(
    () => null,
  );
  const mark = markSvg ? dataUri(markSvg, "image/svg+xml") : null;

  const catalog = JSON.parse(await readFile(CATALOG, "utf8").catch(() => "{}"));
  const tools = catalog.tools ?? [];

  // Rebuilt from scratch so a tool that left the catalog stops being served a
  // card, the same rule build-catalog.mjs applies to the screenshots.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const page of PAGES) {
    const png = await renderPng({
      element: familyCard({ mark, title: page.title, line: page.line }),
      fonts,
    });
    await writeFile(join(OUT_DIR, `${page.slug}.png`), png);
  }

  for (const tool of tools) {
    const artwork = await toolArtwork({ tool, boxWidth: 550, boxHeight: 450 });
    if (!artwork) console.warn(`  ! ${tool.name}: no screenshot and no icon`);
    const png = await renderPng({
      element: toolCard({ mark, tool, artwork }),
      fonts,
    });
    await writeFile(join(OUT_DIR, `${tool.name}.png`), png);
  }

  const written = (await readdir(OUT_DIR)).length;
  console.log(`wrote ${OUT_DIR}: ${written} link previews`);
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
