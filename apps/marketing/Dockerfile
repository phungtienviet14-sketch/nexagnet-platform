# ==============================================================================
# Production Dockerfile for @nexagnet/marketing
# Optimized for Google Cloud Run & Next.js runtime
# ==============================================================================

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Stage 1: Dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tenant/package.json ./packages/tenant/
COPY tools/poc-zalo-bot/package.json ./tools/poc-zalo-bot/
COPY tools/poc-parser/package.json ./tools/poc-parser/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm --filter @nexagnet/marketing build

# Stage 3: Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app /app

EXPOSE 8080
CMD ["pnpm", "--filter", "@nexagnet/marketing", "start"]
