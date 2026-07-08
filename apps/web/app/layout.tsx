import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'U Ultty — Trợ lý đơn hàng AI',
  description: 'AI Co-pilot xử lý đơn hàng Zalo cho U Ultty Việt Nam',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#b45f43',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: bo qua lech thuoc tinh do extension trinh duyet chen
    // vao <html>/<body> truoc khi React hydrate (vd mdl-js, bis_register). Khong giau
    // bug that ben trong — chi tac dung o dung 2 the goc nay.
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
