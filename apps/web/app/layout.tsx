import { loadTenantConfig } from '@netviet/tenant';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './console.css';
import { Providers } from './providers';

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
