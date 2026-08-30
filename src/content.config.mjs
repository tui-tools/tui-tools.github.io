/*
 * ============================================================================
 * The `guides` collection — read this before adding a file to src/content/guides
 * ============================================================================
 *
 * THE EDITORIAL RULE
 *
 * A guide is born from validated work only. It is written after the work was
 * done on a real machine, never before and never instead. That means:
 *
 *   - every command in a guide was actually run, exactly as written, against a
 *     real release or a real system;
 *   - every output shown is the output that command produced. Trimmed for
 *     length, never edited for effect, never invented, never "what it would
 *     print";
 *   - every claim links to the evidence a reader can check without trusting
 *     this site: a release, a workflow run, a repository, a page that carries
 *     the same fact;
 *   - failure modes are shown from a failure that was actually provoked, not
 *     described from memory;
 *   - what a check does NOT prove is stated as plainly as what it does.
 *
 * If a step could not be run, it does not go in the guide. A guide with one
 * plausible-looking invented line in it is worth less than no guide, because a
 * reader has no way to tell which line it was.
 *
 * Nothing internal travels here. Planning documents, roadmaps and internal
 * labels stay where they are; a guide takes the fact and cites the public
 * page or repository that already carries it.
 *
 * DRAFTS
 *
 * `draft: true` keeps an entry out of the built site entirely: the index does
 * not list it and no page is generated for it, so there is no URL to find. The
 * index page and the page generator both go through `publishedGuides()` in
 * src/lib/guides.js rather than filtering for themselves, so the listing and
 * the set of generated URLs can never disagree.
 *
 * FRONTMATTER
 *
 *   title        the guide's own title, without the site name
 *   description   one sentence; it is the meta description and the index blurb
 *   date          when it was first published (YYYY-MM-DD)
 *   updated       optional; only when the content changed materially
 *   tools         the tools the guide is about, by name, for cross-linking
 *   draft         optional; true keeps it out of the build
 */

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const guides = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tools: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { guides };
