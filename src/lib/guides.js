/**
 * The one way the site reads the `guides` collection.
 *
 * A draft is not a hidden page: it is not built at all. Both the index and the
 * page generator call this, so a draft cannot be listed by one and served by
 * the other, and there is no URL left behind to be found by guessing.
 *
 * The editorial rule the collection is written under is in src/content.config.mjs.
 */

import { getCollection } from "astro:content";

/** Every published guide, newest first. Drafts are never returned. */
export async function publishedGuides() {
  const guides = await getCollection("guides", ({ data }) => data.draft !== true);
  return guides.sort((a, b) => b.data.date - a.data.date);
}

/** The date a guide's page and the sitemap should show: the later of the two. */
export function guideDate(guide) {
  return guide.data.updated ?? guide.data.date;
}

/** YYYY-MM-DD, in UTC, the same stamp the rest of the site prints. */
export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}
