import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeBusinessProblem } from '@/components/home/HomeBusinessProblem';
import { HomeWhatWeDo } from '@/components/home/HomeWhatWeDo';
import { HomeDepartmentsGrid } from '@/components/home/HomeDepartmentsGrid';
import { HomeOwnerView } from '@/components/home/HomeOwnerView';
import { HomeIndustriesTeaser } from '@/components/home/HomeIndustriesTeaser';
import { HomeFinalCTA } from '@/components/home/HomeFinalCTA';

export const metadata: Metadata = {
  title: 'nexagnet — Enterprise AI Operations Platform | Nền tảng AI cho Vận hành Doanh nghiệp',
  description:
    'Nexagnet giúp doanh nghiệp đưa AI vào các quy trình giữa khách hàng, nhân viên, dữ liệu và hệ thống — tự động xử lý công việc lặp lại, chuyển ngoại lệ cho con người và tạo một lớp vận hành có kiểm soát.',
  keywords: [
    'nexagnet',
    'Enterprise AI Operations Platform',
    'Nền tảng AI cho vận hành doanh nghiệp',
    'Điều hành doanh nghiệp bằng AI',
    'AI cho phòng ban',
    'Rules Engine tất định',
    'Kiểm soát con người Human in the loop',
    'Quản trị ngoại lệ doanh nghiệp',
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
        {/* Section 1: Hero Platform with Business Operations Map */}
        <HomeHero />

        {/* Section 2: Vấn đề cấp doanh nghiệp (Silos vs Connected Layer) */}
        <HomeBusinessProblem />

        {/* Section 3: 4 Năng lực cốt lõi (Understand, Decide, Orchestrate, Control) */}
        <HomeWhatWeDo />

        {/* Section 4: Ứng dụng theo Phòng ban (Executive, Sales, Marketing, CSKH, Ops, Finance, HR) */}
        <HomeDepartmentsGrid />

        {/* Section 5: Góc nhìn Điều hành cho Chủ doanh nghiệp (Operations Control Center) */}
        <HomeOwnerView />

        {/* Section 6: Giải pháp theo Mô hình Ngành */}
        <HomeIndustriesTeaser />

        {/* Section 7: Final CTA & Lead Intake */}
        <HomeFinalCTA />
      </main>
      <Footer />
    </div>
  );
}
