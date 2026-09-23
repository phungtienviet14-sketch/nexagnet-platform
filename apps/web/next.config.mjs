import { copyMaplibreWorker } from './maplibre-worker.mjs';

// Worker cua MapLibre 6 phai co mat trong `public/maplibre/` TRUOC khi trang ban do chay — ke ca
// khi `next dev` duoc goi thang (Playwright, `dev-transport.mjs`). Xem `maplibre-worker.mjs`.
copyMaplibreWorker();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
