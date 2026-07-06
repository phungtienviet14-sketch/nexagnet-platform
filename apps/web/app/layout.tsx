import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'U Ultty — Trợ lý đơn hàng AI',
  description: 'AI Co-pilot xử lý đơn hàng Zalo cho U Ultty Việt Nam',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
