# Build image for the TanStack Start apps (app / renderer / marketing).
# Pass the app name via build arg APP (e.g. --build-arg APP=renderer).
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@realtr/${APP}" build

FROM base AS run
ARG APP
WORKDIR /app
# Nitro build output is self-contained.
COPY --from=build /repo/apps/${APP}/.output ./.output
ENV NODE_ENV=production
# Nitro server honors PORT (set per-service in docker-compose).
CMD ["node", ".output/server/index.mjs"]
