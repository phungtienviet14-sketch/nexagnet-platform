import { loadTenantConfig } from '@netviet/tenant';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './console.css';
import { Providers } from './providers';

/**
 * MOT IMAGE CHAY DUOC MOI KHACH. Mac dinh Next.js prerender TINH cac route nay luc `next build`,
 * nghia la <title>/theme-color/ten khach bi NUONG vao artifact — image gan chet vao dung mot khach
 * va doi khach thi phai build lai. `force-dynamic` bat cac route render luc NHAN YEU CAU, nen goi
 * khach duoc doc tu bien moi truong luc CHAY.
 *
 * Dat o layout goc -> ap dung cho ca cay route ben duoi. Khong danh doi gi: moi trang deu la client
 * component lay du lieu tu API luc chay, khong co gi dang prerender san.
 *
 * Luoi an toan: CI build `apps/web` KHONG dat TENANT. Neu ai do them mot trang tinh doc goi khach,
 * loader se nem va build do — thay vi lang le nuong ten khach vao image.
 */
export const dynamic = 'force-dynamic';

/**
 * Tieu de/mo ta/mau chu dao den tu GOI KHACH (`tenants/<slug>/tenant.json`), khong hardcode
 * trong app nua (Dot B1). Doc o day duoc vi layout la Server Component; chuoi duoc truyen xuong
 * cac component client qua <Providers branding=...>.
 */
export function generateMetadata(): Metadata {
  const { branding } = loadTenantConfig();
  return {
    title: branding.pageTitle,
    description: branding.pageDescription,
    manifest: '/manifest.webmanifest',
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: loadTenantConfig().branding.themeColor,
    width: 'device-width',
    initialScale: 1,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const { branding, shortName } = loadTenantConfig();
  return (
    // suppressHydrationWarning: bo qua lech thuoc tinh do extension trinh duyet chen
    // vao <html>/<body> truoc khi React hydrate (vd mdl-js, bis_register). Khong giau
    // bug that ben trong — chi tac dung o dung 2 the goc nay.
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers branding={{ ...branding, shortName }}>{children}</Providers>
      </body>
    </html>
  );
}
