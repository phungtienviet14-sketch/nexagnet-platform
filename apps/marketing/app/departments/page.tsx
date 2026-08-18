import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HubHero } from '@/components/departments/HubHero';
import { HomeDepartmentsGrid } from '@/components/home/HomeDepartmentsGrid';
import { HomeOwnerView } from '@/components/home/HomeOwnerView';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'AI cho các Phòng ban Doanh nghiệp | nexagnet',
  description:
    'Khám phá cách Nexagnet đưa AI vào từng phòng ban trong doanh nghiệp: Ban Giám đốc, Bán hàng, Marketing, CSKH, Vận hành, Tài chính và Nhân sự theo các luồng quy trình có kiểm soát.',
  keywords: [
    'AI cho phòng ban doanh nghiệp',
    'AI cho phòng Sales',
    'AI cho phòng Vận hành',
    'AI cho Ban Giám đốc',
    'AI cho CSKH',
    'Tự động hóa luồng công việc phòng ban',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments',
  },
};

export default function DepartmentsHubPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <HubHero
          eyebrow="HỆ THỐNG PHÒNG BAN DOANH NGHIỆP"
          badge="7 KHỐI PHÒNG BAN"
          title="7 Phòng ban — 1 Nền tảng AI Vận hành Chung."
          subtitle="Một doanh nghiệp có nhiều phòng ban và nhiều mắt xích luân chuyển. Nexagnet cho phép bắt đầu giải quyết bài toán của một bộ phận cụ thể rồi mở rộng sang các phòng ban khác."
          primaryCtaText="Trao đổi về phòng ban của bạn"
          supportingPill="Kết nối liên phòng ban · Rules Engine tất định · Con người kiểm soát"
        />

        <HomeDepartmentsGrid />

        <HomeOwnerView />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
