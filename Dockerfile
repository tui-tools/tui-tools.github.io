# The site as a container, for hosting it somewhere other than GitHub Pages.
#
# Stage 1 does exactly what the publish workflow does — build the catalog from
# the GitHub API, then render the pages — so the container and Pages are built
# from the same two commands and cannot drift.
#
# Stage 2 is nginx with the rendered dist/ and nothing else: no Node, no
# node_modules, no GitHub token.

FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first, so a content-only change reuses this layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build env vars have to be declared as ARGs to reach the build — Quave ONE
# passes the ones marked "Build" or "Both" this way, and Docker gives a build
# nothing it did not declare.
#
# GITHUB_TOKEN is optional. Without it the catalog script falls back to the
# anonymous GitHub API and its 60 requests per hour, shared by every anonymous
# caller from the same address. One catalog run costs roughly 3 requests per
# tool plus one for the org listing, so a family of a dozen tools fits — but on
# a shared build runner it will not reliably, and a rate-limited run keeps the
# catalog already on disk, which in a fresh container is none at all and fails
# the build. Set it for anything but a one-off local build.
#
# The value is only ever an ARG — an ARG is already visible to RUN as an
# environment variable, so there is no ENV to persist it, and the runtime stage
# below copies dist/ and nothing else. It does land in the build stage's image
# history, which is the cost of the mechanism the platform passes build
# variables through; use a read-only token with no scopes beyond public repos.
ARG GITHUB_TOKEN=""

# The canonical host. It is the only thing that has to change when the site
# moves domains: canonical links, sitemap and robots.txt all come from it.
ARG SITE_URL="https://tui.tools"

# The same three commands the publish workflow runs, in the same order: the
# catalog first, then the 1200x630 link previews drawn from it, then Astro.
#
# The previews are rendered by satori and @resvg/resvg-js. resvg is a native
# addon, and it publishes musl builds for linux x64 and arm64, so npm ci above
# resolves a working binary on this alpine stage without a toolchain — which is
# why the base image does not need to change.
RUN npm run catalog && npm run og && npx astro build

FROM nginx:1.29-alpine AS runtime

# Copied as a template, not a config: the entrypoint runs envsubst over
# /etc/nginx/templates/*.template at start-up so ${PORT} is resolved then, and
# the filter keeps envsubst away from nginx's own $variables.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

# Quave ONE's default app port. Override with the PORT env var, and keep it
# equal to the port configured on the app environment.
ENV PORT=3000
ENV NGINX_ENVSUBST_FILTER="^PORT$"

COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
