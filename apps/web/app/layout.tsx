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
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
