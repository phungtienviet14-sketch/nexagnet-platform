/** @type {import('next').NextConfig} */
// ============================================================================
// next.config danh RIENG cho ban demo Hugging Face Spaces (KHONG thay file goc
// apps/web/next.config.mjs cua repo — Dockerfile chi copy de len khi build).
//
// Web la app cong khai tren cong 7860. Trinh duyet goi API "same-origin"
// (NEXT_PUBLIC_API_URL="" luc build -> lib/api.ts BASE=""), Next reverse-proxy
// cac path API sang NestJS API noi bo (mac dinh http://localhost:3001) qua rewrites.
// -> Khong dinh CORS, khong can biet URL that cua Space, SSE /events chay xuyen proxy.
// Doi dich neu API o cong khac: dat env API_INTERNAL_URL khi build/run.
// ============================================================================
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

// Moi path top-level ma trinh duyet goi (xem apps/web/lib/api.ts + hooks/useAgentStream.ts).
const API_PATHS = [
  '/events', // SSE 6 agent real-time
  '/orders',
  '/orders/:path*', // /orders/:id/approve, /reject
  '/messages',
  '/demo/:path*', // /demo/config, /demo/simulate, /demo/samples, /demo/groups, /demo/rerun/:id
  '/kiotviet/:path*', // /kiotviet/products, /kiotviet/orders
  '/knowledge/:path*', // /knowledge/summary...
  '/broadcast',
  '/health',
];

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return API_PATHS.map((source) => ({
      source,
      destination: `${API_INTERNAL_URL}${source}`,
    }));
  },
};

export default nextConfig;
