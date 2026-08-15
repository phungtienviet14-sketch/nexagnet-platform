import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import './marketing.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://nexagnet247.com'),
  title: 'nexagnet — Nền tảng AI Agent cho vận hành doanh nghiệp',
  description:
    'nexagnet là nền tảng AI Agent theo module, giúp doanh nghiệp tự động hóa từng quy trình từ hội thoại đến vận hành mà vẫn duy trì quy tắc và quyền kiểm soát.',
  keywords: [
    'nexagnet',
    'AI Agent cho doanh nghiệp',
    'Tự động hóa đơn hàng Zalo',
    'Rules Engine quy tắc kinh doanh',
    'Tự động hóa vận hành doanh nghiệp',
  ],
  authors: [{ name: 'nexagnet' }],
  alternates: {
    canonical: 'https://nexagnet247.com',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: 'https://nexagnet247.com',
    title: 'nexagnet — Nền tảng AI Agent cho vận hành doanh nghiệp',
    description:
      'AI thấu hiểu. Quy tắc quyết định. Con người luôn làm chủ. Nền tảng AI Agent theo module mở rộng cho toàn bộ quy trình vận hành doanh nghiệp.',
    siteName: 'nexagnet',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'nexagnet — Nền tảng AI Agent cho vận hành doanh nghiệp',
    description:
      'AI cho từng quy trình vận hành. Bắt đầu từ một module. Mở rộng khi doanh nghiệp sẵn sàng.',
  },
};

export const viewport: Viewport = {
  themeColor: '#F5F3EE',
  width: 'device-width',
  initialScale: 1,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://nexagnet247.com/#organization',
      name: 'nexagnet',
      url: 'https://nexagnet247.com',
      logo: 'https://nexagnet247.com/icon.svg',
      description: 'Nền tảng AI Agent theo module cho vận hành doanh nghiệp.',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'contact@nexagnet247.com',
        availableLanguage: ['Vietnamese', 'English'],
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://nexagnet247.com/#software',
      name: 'nexagnet',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'VND',
        description: 'Tư vấn và demo giải pháp trực tiếp 1-1',
      },
      description:
        'Nền tảng AI Agent theo module kết hợp Rules Engine tất định và Cổng kiểm duyệt nhân sự Human-in-the-Loop.',
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
