// @ts-check
import { defineConfig } from "astro/config";

// The organization site repository serves at the root, so there is no base
// path to carry around — and switching to a custom domain later changes only
// `site`, not a single link in the pages.
export default defineConfig({
  site: process.env.SITE_URL ?? "https://tui-tools.github.io",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  devToolbar: {
    enabled: false,
  },
});
