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
COPY packages/tenant/package.json packages/tenant/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/poc-zalo-bot/package.json tools/poc-zalo-bot/
COPY tools/poc-parser/package.json tools/poc-parser/
RUN corepack pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN corepack pnpm --filter @netviet/api exec prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=""
# CO Y KHONG dat TENANT o day. Build phai chay duoc ma KHONG biet khach nao — do chinh la dinh
# nghia cua "mot image dung cho moi khach". Neu ai do them mot trang tinh doc goi khach, loader se
# nem va build do ngay tai day, thay vi lang le nuong ten khach vao image.
# Hop dong nay duoc khoa bang apps/web/tenant-runtime.contract.mjs.
RUN corepack pnpm --filter @netviet/shared --filter @netviet/api --filter @netviet/web build

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=""
# GOI KHACH den tu compose luc CHAY (`TENANT` trong .runtime/secrets.env), khong nuong vao image.
# Cung mot image nay chay duoc cho khach khac chi bang cach doi bien do — hoac tro TENANT_DIR vao
# mot goi mount tu ngoai neu khach khong muon goi cua ho nam trong image.
COPY --from=build /app /app
LABEL org.opencontainers.image.title="NetViet Zalo AI Orders"
CMD ["node", "apps/api/dist/main.js"]
