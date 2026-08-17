import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HeroPlatformEcosystem } from '@/components/home/HeroPlatformEcosystem';
import { HomeSolutionsOverview } from '@/components/home/HomeSolutionsOverview';
import { HomeProductsSection } from '@/components/home/HomeProductsSection';
import { HomeIndustriesSection } from '@/components/home/HomeIndustriesSection';
import { HomeTrustSection } from '@/components/home/HomeTrustSection';
import { HomeExpandSection } from '@/components/home/HomeExpandSection';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'nexagnet — Nền tảng AI cho Doanh nghiệp',
  description:
    'nexagnet giúp doanh nghiệp ứng dụng AI vào bán hàng, chăm sóc khách hàng và vận hành nội bộ theo từng module có kiểm soát an toàn.',
  keywords: [
    'nexagnet',
    'Nền tảng AI cho doanh nghiệp',
    'Enterprise AI Platform',
    'AI bán hàng B2B',
    'AI chăm sóc khách hàng',
    'Tự động hóa vận hành doanh nghiệp',
    'Rules Engine tất định',
    'Kiểm soát con người Human-in-the-loop',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com',
  },
};

export default function HomePage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        {/* Section 1: Hero Platform Ecosystem */}
        <HeroPlatformEcosystem />

        {/* Section 2: Lĩnh vực ứng dụng (Bán hàng, CSKH, Vận hành) */}
        <HomeSolutionsOverview />

        {/* Section 3: Sản phẩm phù hợp (Spotlight: Order Automation) */}
        <HomeProductsSection />

        {/* Section 4: Ứng dụng theo ngành */}
        <HomeIndustriesSection />

        {/* Section 5: Kiểm soát & An toàn Doanh nghiệp */}
        <HomeTrustSection />

        {/* Section 6: Lộ trình mở rộng từng bước */}
        <HomeExpandSection />

        {/* Section 7: Final Lead Gen & Demo CTA */}
        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
