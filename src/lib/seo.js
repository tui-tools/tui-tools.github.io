/**
 * The page-level SEO strings: the `<title>`, the meta description, and the one
 * generated sentence a tool page opens with.
 *
 * Everything here is derived from the catalog rather than written by hand, for
 * the same reason the rest of the site is: a tool that changes its tagline or
 * ships a new backend must not need a second edit somewhere else to stay
 * truthful. The catalog's prose is markdown, so it is flattened first — a
 * `<title>` with `**ufw**` in it is worse than no keyword at all.
 */

const TITLE_SUFFIX = "tui-tools";

/** A title long enough to be cut by Google is a title nobody reads to the end. */
const TITLE_MAX = 60;

/** The window a meta description is actually rendered in full inside. */
const DESCRIPTION_MIN = 150;
const DESCRIPTION_MAX = 160;

/**
 * The safe subset of markdown src/lib/markdown.js renders, flattened back to
 * the words alone: link labels survive, their URLs do not, and the emphasis
 * markers are dropped.
 */
export function plainText(markdown) {
  if (!markdown) return "";
  return markdown
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Words whose trailing dot is not the end of a sentence. Version numbers and
 * names like `acme.sh` need no entry: a split only happens where whitespace
 * follows the dot, and those carry none.
 */
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|approx|Mr|Mrs|Ms|Dr|No)\.$/i;

/**
 * Split prose into sentences.
 *
 * The catalog's descriptions routinely open a sentence with a lowercase
 * program name — "systemd timers and cron are two schedulers…" — so requiring
 * a capital after the dot would swallow half of them into one giant sentence.
 * The split is on the dot instead, and the few dots that are not sentence ends
 * are stitched back together.
 */
export function sentences(text) {
  const flat = plainText(text);
  if (!flat) return [];
  const parts = flat.split(/(?<=[.!?])\s+(?=\S)/);
  const merged = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (previous && ABBREVIATIONS.test(previous)) {
      merged[merged.length - 1] = `${previous} ${part}`;
      continue;
    }
    merged.push(part);
  }
  return merged.map((sentence) => sentence.trim()).filter(Boolean);
}

/** The first sentence of a description, markdown flattened. */
export function firstSentence(text) {
  return sentences(text)[0] ?? "";
}

/**
 * Cut a phrase to `limit` characters without ending mid-word. A clause
 * boundary is preferred when one falls late enough to keep the phrase
 * meaningful — "Every certificate on the machine" reads like a title, "Every
 * certificate on the machine, and what will" reads like a truncation.
 */
function cutPhrase(phrase, limit) {
  if (phrase.length <= limit) return phrase;
  const head = phrase.slice(0, limit + 1);
  const clause = Math.max(head.lastIndexOf(", "), head.lastIndexOf(": "), head.lastIndexOf(" — "));
  if (clause >= Math.floor(limit * 0.55)) return phrase.slice(0, clause).trim();
  const word = head.lastIndexOf(" ");
  return word > 0 ? phrase.slice(0, word).trim() : phrase.slice(0, limit).trim();
}

/**
 * `<name>: <tagline> | tui-tools`, kept under the length a search result
 * shows. The suffix is the first thing dropped when it does not fit: the tool
 * name already carries the family, and the tagline carries the keywords.
 */
export function toolTitle({ name, tagline }) {
  const clean = plainText(tagline);
  if (!clean) return `${name} | ${TITLE_SUFFIX}`;

  const withSuffix = `${name}: ${clean} | ${TITLE_SUFFIX}`;
  if (withSuffix.length <= TITLE_MAX) return withSuffix;

  const withoutSuffix = `${name}: ${clean}`;
  if (withoutSuffix.length <= TITLE_MAX) return withoutSuffix;

  const budget = TITLE_MAX - `${name}: `.length;
  const cut = cutPhrase(clean, budget);
  // A tagline whose first word already overflows leaves nothing worth showing.
  return cut.length >= 12 ? `${name}: ${cut}` : `${name} | ${TITLE_SUFFIX}`;
}

/** `<page title> | tui-tools`, for every page that is not a tool. */
export function pageTitle(title, { suffix = TITLE_SUFFIX } = {}) {
  return title === suffix ? title : `${title} | ${suffix}`;
}

/**
 * A meta description of 150 to 160 characters that ends on a full sentence:
 * the tagline, then as much of the description as fits.
 *
 * Candidates are whole sentences only, so the result is never a phrase cut in
 * half with an ellipsis. The longest candidate that still fits wins, which is
 * also the one that carries the most of the tool's own words.
 */
export function metaDescription({
  tagline,
  description,
  min = DESCRIPTION_MIN,
  max = DESCRIPTION_MAX,
}) {
  const lead = plainText(tagline);
  const opening = lead ? (/[.!?]$/.test(lead) ? lead : `${lead}.`) : "";
  const rest = sentences(description);

  const candidates = [];
  for (const prefix of [opening, ""]) {
    let text = prefix;
    if (text) candidates.push(text);
    for (const sentence of rest) {
      text = text ? `${text} ${sentence}` : sentence;
      candidates.push(text);
    }
  }

  const fitting = candidates.filter((text) => text.length <= max);
  if (fitting.length > 0) {
    const inWindow = fitting.filter((text) => text.length >= min);
    const pool = inWindow.length > 0 ? inWindow : fitting;
    return pool.reduce((best, text) => (text.length > best.length ? text : best), "");
  }

  // Nothing fits whole: cut the shortest candidate at a word boundary. Rare
  // enough that it is a fallback rather than a shape to design around.
  const shortest = candidates.reduce((best, text) => (text.length < best.length ? text : best));
  return `${cutPhrase(shortest, max - 1)}…`;
}

/** "a, b and c" — the way a sentence lists things, not the way JSON does. */
export function joinAnd(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The sentence a tool page opens with, under the tagline.
 *
 * It exists so the page carries the words a reader actually types into a
 * search box — "ufw tui", "systemctl tui" — next to the plain phrase "terminal
 * UI (TUI)", which the taglines deliberately never spell out. The backends are
 * named by their binary, because that is the name a person searches for.
 *
 * When the description's first sentence already opens with "A terminal UI
 * for", that prefix is dropped rather than repeated: the generated sentence
 * has just said it.
 */
export function toolIntro({ backends = [], description }) {
  const binaries = [...new Set(backends.map((backend) => backend.binary).filter(Boolean))];
  const subject = binaries.length > 0 ? `for ${joinAnd(binaries)} on Linux` : "for Linux";
  const lead = `A terminal UI (TUI) ${subject}`;

  const first = firstSentence(description);
  const tail = first.replace(/^An?\s+terminal UI\s+(?:for|over)\s+/i, "").trim();
  if (!tail) return `${lead}.`;

  // A tail that already carries a colon would give the sentence two, so it
  // becomes a sentence of its own instead.
  if (tail.includes(": ")) {
    return `${lead}. ${tail[0].toUpperCase()}${tail.slice(1)}`;
  }
  return `${lead}: ${uncapitalize(tail)}`;
}

/**
 * Names that are spelled with a capital wherever they appear, so they keep it
 * after the colon. Everything else is an ordinary word that started a sentence.
 */
const PROPER_NOUNS =
  /^(?:WireGuard|Samba|Docker|Podman|Linux|SSH|TLS|SMART|GitHub|Wi-Fi|Active|Let's)\b/;

function uncapitalize(sentence) {
  if (PROPER_NOUNS.test(sentence)) return sentence;
  return `${sentence[0].toLowerCase()}${sentence.slice(1)}`;
}
