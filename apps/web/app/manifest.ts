import { tenantBranding } from '@netviet/tenant';
import type { MetadataRoute } from 'next';

/**
 * PWA manifest SINH LUC CHAY. Truoc day day la file tinh `public/manifest.webmanifest` mang san ten
 * va mau cua mot khach — file tinh di theo image, nen image khong con dung duoc cho khach khac.
 * Next.js phuc vu ham nay tai dung URL cu `/manifest.webmanifest`.
 *
 * Bo truong giu NGUYEN nhu file tinh cu (khong them `description`) de hanh vi Ultty khong doi.
 * `force-dynamic`: xem chu thich dai trong `app/layout.tsx`.
 */
export const dynamic = 'force-dynamic';

export default function manifest(): MetadataRoute.Manifest {
  const branding = tenantBranding();
  return {
    name: branding.installName,
    short_name: branding.productName,
    start_url: '/',
    display: 'standalone',
    background_color: branding.backgroundColor,
    theme_color: branding.themeColor,
    // File tinh cu ghi `purpose: "any maskable"` (spec cho phep ghep bang dau cach) nhung kieu cua
    // Next chi nhan MOT gia tri -> tach thanh hai muc, trinh duyet hieu y het nhu cu.
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
