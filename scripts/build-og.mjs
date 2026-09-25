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
 *     404: the brand mark, the wordmark, the page's own line, and the domain;
 *   - a guide card, for /guides/<slug>, drawn into /og/guides/<slug>.png: the
 *     guide's title, the tools it covers, and, when its frontmatter names a
 *     `cover`, that screenshot on the right. A guide is what gets shared, so
 *     one generic "Guides" image for all of them would make every post look
 *     like the same link;
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
import yaml from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/og");
const CATALOG = join(ROOT, "src/data/catalog.json");
const GUIDES_DIR = join(ROOT, "src/content/guides");

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
  {
    slug: "about",
    title: "About",
    line: "Who builds tui-tools",
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

/**
 * A guide's cover, fitted into the right-hand frame the same way a tool card
 * fits its screenshot. `crop` narrows it to one region first, in the source
 * image's pixels, because a terminal screenshot is often a small dialog in
 * the middle of an empty window and the card is too small to waste the frame
 * on the empty part. A cover that is missing or not a PNG leaves the card
 * text only rather than failing the build: the schema already checked the
 * path's shape, and a catalog screenshot can vanish when a tool renames one.
 */
async function coverArtwork({ path, crop, boxWidth, boxHeight }) {
  const bytes = await readPublic(path);
  if (!bytes) return null;
  const size = pngSize(bytes);
  if (!size) return null;
  // The crop is clamped to the image so a stale rectangle degrades to a
  // smaller region instead of an empty frame.
  const region = crop
    ? {
        x: Math.min(crop.x, size.width - 1),
        y: Math.min(crop.y, size.height - 1),
        width: Math.min(crop.width, size.width - crop.x),
        height: Math.min(crop.height, size.height - crop.y),
      }
    : { x: 0, y: 0, width: size.width, height: size.height };
  const scale = Math.min(boxWidth / region.width, boxHeight / region.height, 1);
  return {
    src: dataUri(bytes, "image/png"),
    // The frame the reader sees.
    width: Math.round(region.width * scale),
    height: Math.round(region.height * scale),
    // The whole image, scaled, and shifted so the region sits in the frame.
    imageWidth: Math.round(size.width * scale),
    imageHeight: Math.round(size.height * scale),
    offsetX: -Math.round(region.x * scale),
    offsetY: -Math.round(region.y * scale),
  };
}

// ------------------------------------------------------------------ guides

/**
 * The published guides, read straight from their frontmatter. This script
 * runs before Astro, so the content collection is not available; the fields
 * it needs are few and the schema in src/content.config.mjs has validated
 * them by the time the site itself builds. Drafts get no card, for the same
 * reason they get no page.
 */
async function readGuides() {
  const files = await readdir(GUIDES_DIR).catch(() => []);
  const guides = [];
  for (const file of files.filter((name) => name.endsWith(".mdx")).sort()) {
    const source = await readFile(join(GUIDES_DIR, file), "utf8");
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;
    const data = yaml.load(match[1]) ?? {};
    if (data.draft === true) continue;
    guides.push({
      slug: file.replace(/\.mdx$/, ""),
      title: String(data.title ?? ""),
      tools: Array.isArray(data.tools) ? data.tools.map(String) : [],
      cover: typeof data.cover === "string" ? data.cover : null,
      coverCrop: data.coverCrop ?? null,
    });
  }
  return guides;
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

/** A tool name as a small outlined chip, the way the guide pages show them. */
function toolChip(name) {
  return text(name, {
    display: "flex",
    padding: "5px 13px",
    border: `2px solid ${FRAME}`,
    borderRadius: "999px",
    background: PANEL,
    fontFamily: "JetBrains Mono",
    fontSize: "19px",
    color: TOOL,
  });
}

/**
 * A guide card: a small brand line saying where this is from, the guide's
 * own title as the headline, and the tools it covers. With a cover the text
 * takes the left column and the screenshot the right, like a tool card;
 * without one the title gets the full width.
 */
function guideCard({ mark, guide, artwork }) {
  const hasArt = Boolean(artwork);
  const title = guide.title;
  // Long titles step down a size so they stay within three lines.
  const titleSize = hasArt
    ? title.length > 42 ? 44 : 50
    : title.length > 48 ? 60 : 68;

  const eyebrow = h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "14px",
        fontFamily: "JetBrains Mono",
        fontWeight: 700,
        fontSize: "30px",
        letterSpacing: "-0.02em",
      },
    },
    mark
      ? h("img", { src: mark, width: 40, height: 40, style: { display: "flex" } })
      : null,
    h(
      "div",
      { style: { display: "flex" } },
      text("tui-", { display: "flex", color: FAMILY }),
      text("tools", { display: "flex", color: FG }),
    ),
    text("/ guides", { display: "flex", color: MUTED, fontWeight: 400 }),
  );

  const words = h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        ...(hasArt ? { width: "520px", flexShrink: 0 } : { flexGrow: 1 }),
      },
    },
    eyebrow,
    // One box per word, so the line breaks only between words: left to
    // itself the renderer splits "tui-cert" at its hyphen.
    h(
      "div",
      {
        style: {
          display: "flex",
          flexWrap: "wrap",
          marginTop: "34px",
          fontWeight: 600,
          fontSize: `${titleSize}px`,
          lineHeight: 1.18,
          letterSpacing: "-0.01em",
          color: FG,
          maxWidth: hasArt ? "520px" : "1000px",
        },
      },
      title.split(/\s+/).map((word) =>
        text(word, { display: "flex", marginRight: `${Math.round(titleSize * 0.26)}px` }),
      ),
    ),
    guide.tools.length > 0
      ? h(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "34px",
            },
          },
          guide.tools.map(toolChip),
        )
      : null,
  );

  return card(
    [
      h(
        "div",
        { style: { display: "flex", flexGrow: 1, gap: "32px", alignItems: "center" } },
        words,
        hasArt
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
              // The frame clips the scaled image to the cropped region.
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    position: "relative",
                    overflow: "hidden",
                    width: `${artwork.width}px`,
                    height: `${artwork.height}px`,
                    borderRadius: "10px",
                    border: `1px solid ${FRAME}`,
                    background: PANEL,
                  },
                },
                h("img", {
                  src: artwork.src,
                  width: artwork.imageWidth,
                  height: artwork.imageHeight,
                  style: {
                    display: "flex",
                    position: "absolute",
                    left: `${artwork.offsetX}px`,
                    top: `${artwork.offsetY}px`,
                  },
                }),
              ),
            )
          : null,
      ),
      footer("guide"),
    ],
    { accent: FAMILY },
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

  const guides = await readGuides();
  await mkdir(join(OUT_DIR, "guides"), { recursive: true });
  for (const guide of guides) {
    const artwork = guide.cover
      ? await coverArtwork({
          path: guide.cover,
          crop: guide.coverCrop,
          boxWidth: 540,
          boxHeight: 440,
        })
      : null;
    if (guide.cover && !artwork) {
      console.warn(`  ! guide ${guide.slug}: cover ${guide.cover} not found, text-only card`);
    }
    const png = await renderPng({
      element: guideCard({ mark, guide, artwork }),
      fonts,
    });
    await writeFile(join(OUT_DIR, "guides", `${guide.slug}.png`), png);
  }

  const written = (await readdir(OUT_DIR)).length - 1 + guides.length;
  console.log(`wrote ${OUT_DIR}: ${written} link previews`);
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
