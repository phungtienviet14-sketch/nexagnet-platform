# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46 AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/poc-zalo-bot/package.json tools/poc-zalo-bot/
COPY tools/poc-parser/package.json tools/poc-parser/
RUN corepack pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN corepack pnpm --filter @ultty/api exec prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=""
RUN corepack pnpm --filter @ultty/shared --filter @ultty/api --filter @ultty/web build

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=""
COPY --from=build /app /app
LABEL org.opencontainers.image.title="NetViet Zalo AI Orders"
CMD ["node", "apps/api/dist/main.js"]
