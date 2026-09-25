# syntax=docker/dockerfile:1.7
#
# PWA Nexagent Transport (#394) — ban xuat web cua apps/transport-mobile + Caddy phuc vu CUNG ORIGIN
# voi API (xem Caddyfile canh tep nay).
#
#   docker build -f deploy/pwa/Dockerfile -t nexagent-pwa .        # build context = GOC repo
#   docker run -p 8080:8080 -e API_UPSTREAM=http://api:3001 nexagent-pwa
#
# Build context la goc repo, nhung `.dockerignore` o goc LOAI `apps/transport-mobile` (bat bien cua
# image may chu). Tep `Dockerfile.dockerignore` canh day thay no cho RIENG image nay (BuildKit) va
# chi cho vao dung nhung gi can — khong goi khach, khong ma nguon may chu.

FROM node:22-bookworm-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46 AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=1
ENV EXPO_NO_TELEMETRY=1
RUN corepack enable
WORKDIR /app

# `.pnpmfile.cjs` BAT BUOC di cung lockfile (pnpmfileChecksum) — thieu la --frozen-lockfile tu choi.
# Chi package.json cua app di dong va goi workspace no phu thuoc: du cho `--filter ...`.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .pnpmfile.cjs ./
COPY packages/driver-outbox/package.json packages/driver-outbox/
COPY apps/transport-mobile/package.json apps/transport-mobile/
RUN corepack pnpm install --frozen-lockfile --filter "@nexagnet/transport-mobile..."

COPY packages/driver-outbox packages/driver-outbox
COPY apps/transport-mobile apps/transport-mobile
# Builder bo qua Dockerfile.dockerignore thi `.dockerignore` goc da loai ma nguon di dong: do NGAY.
RUN test -f apps/transport-mobile/app.config.ts \
  || { echo "Thiếu apps/transport-mobile trong build context — builder không đọc deploy/pwa/Dockerfile.dockerignore" >&2; exit 1; }
RUN corepack pnpm --filter "@nexagnet/transport-mobile^..." build

# Bien EXPO_PUBLIC_* duoc NUONG vao bo JS luc build (khong phai bi mat). KHONG dat
# EXPO_PUBLIC_API_BASE_URL: PWA goi API cung origin, dat no la pha mo hinh cookie cung origin.
ARG APP_VARIANT=production
ARG APP_BUILD_NUMBER=1
ARG APP_GIT_SHA=
ARG EXPO_PUBLIC_MAP_PROVIDER=
ENV APP_VARIANT=$APP_VARIANT \
  APP_BUILD_NUMBER=$APP_BUILD_NUMBER \
  APP_GIT_SHA=$APP_GIT_SHA \
  EXPO_PUBLIC_MAP_PROVIDER=$EXPO_PUBLIC_MAP_PROVIDER
WORKDIR /app/apps/transport-mobile
RUN corepack pnpm exec expo export --platform web --output-dir dist-web \
  && node scripts/pwa-postexport.mjs dist-web

FROM caddy:2-alpine AS runtime
# Chay KHONG phai root: cong >1024, khong ACME, khong admin — Caddy chi can ghi /config, /data.
RUN addgroup -S pwa && adduser -S -G pwa pwa && chown -R pwa:pwa /config /data
COPY deploy/pwa/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/transport-mobile/dist-web /srv
ENV PORT=8080 \
  PWA_FORCE_HTTPS_PROTO=on \
  PWA_ROOT=/srv
USER pwa
EXPOSE 8080
LABEL org.opencontainers.image.title="Nexagent Transport PWA"
# Thieu API_UPSTREAM thi dung ngay voi mot cau ro rang, khong len mot cong tra 502 cho moi lan goi.
CMD ["sh", "-c", "test -n \"$API_UPSTREAM\" || { echo 'API_UPSTREAM chưa đặt (vd http://api-321.railway.internal:3001)' >&2; exit 1; }; exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
