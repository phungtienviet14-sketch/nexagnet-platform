# =============================================================================
# Ultty AI — DEMO cho Hugging Face Spaces (SDK: docker)
# -----------------------------------------------------------------------------
# Topology 1-container (Phuong an A): Next.js (web) la app CONG KHAI tren cong 7860,
# reverse-proxy cac path API sang NestJS API noi bo tren cong 3001 qua next.config rewrites.
# Trinh duyet goi API "same-origin" -> khong dinh CORS, khong can biet URL that cua Space.
#
# Che do DEMO chay OFFLINE hoan toan (khong can dich vu ngoai, khong bake secret):
#   PARSER_MODE=mock  CHANNEL_MODE=mock  PERSISTENCE=memory
#
# Build context BAT BUOC = goc repo (Dockerfile COPY apps/, packages/, tools/, lockfile...).
# Vi du build tay:  docker build -f deploy/hf-demo/Dockerfile -t ultty-demo .
# =============================================================================

# ---------- base: node 22 + corepack(pnpm) + openssl (Prisma engine) ----------
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# openssl + ca-certificates: Prisma Client can openssl runtime tren Debian.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

# ---------- deps: cai dependencies (cache theo manifest) ----------
FROM base AS deps
# Copy TRUOC cac manifest de tan dung cache layer: chi cai lai khi lockfile/manifest doi.
# pnpm --frozen-lockfile can DU package.json cua MOI workspace package (apps/* packages/* tools/*).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/tenant/package.json packages/tenant/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/poc-zalo-bot/package.json tools/poc-zalo-bot/
COPY tools/poc-parser/package.json tools/poc-parser/
RUN corepack pnpm install --frozen-lockfile

# ---------- build: sinh Prisma Client + build shared -> api -> web ----------
FROM deps AS build
COPY . .
# Overlay next.config danh RIENG cho demo: them rewrites (same-origin -> API noi bo).
# Chi ap dung TRONG build Docker; KHONG dung file goc apps/web/next.config.mjs cua repo.
COPY deploy/hf-demo/next.config.mjs apps/web/next.config.mjs
# Prisma Client duoc import VO DIEU KIEN luc boot (PrismaService), ke ca PERSISTENCE=memory
# -> BAT BUOC generate trong container de dung engine Debian.
RUN corepack pnpm --filter @netviet/api exec prisma generate
# Build theo thu tu phu thuoc: @netviet/shared (dist) truoc, roi api + web.
# NEXT_PUBLIC_API_URL="" -> lib/api.ts BASE="" -> trinh duyet goi /orders, /events... same-origin.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=""
RUN corepack pnpm --filter @netviet/shared --filter @netviet/tenant \
  --filter @netviet/api --filter @netviet/web build

# ---------- runtime: stage gon, chi mang theo app da build ----------
FROM base AS runtime
ENV NODE_ENV=production
# GOI KHACH. `next build` o stage tren CO Y khong biet khach nao; danh tinh khach chi duoc gan o
# day, luc CHAY. Space nay la demo cua Ultty -> TENANT=ultty. Doi khach: `docker run -e TENANT=...`
# hoac sua bien nay, KHONG phai build lai theo khach.
ENV TENANT=ultty
# Che do DEMO offline — khong secret nao.
ENV PARSER_MODE=mock
ENV CHANNEL_MODE=mock
ENV PERSISTENCE=memory
# API noi bo (3001) + web cong cong (7860). HF yeu cau app nghe 0.0.0.0:7860.
ENV PORT=3001
ENV WEB_PORT=7860
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=""

# App da build (node_modules + dist + .next + config). pnpm node_modules la self-contained.
COPY --from=build /app /app
COPY deploy/hf-demo/start.sh /app/start.sh
RUN chmod +x /app/start.sh \
  && chmod -R a+w /app/apps/web/.next

EXPOSE 7860
CMD ["/app/start.sh"]
