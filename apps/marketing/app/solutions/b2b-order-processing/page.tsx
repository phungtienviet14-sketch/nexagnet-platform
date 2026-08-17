import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { Footer } from '../../../components/Footer';
import { PlatformArchitecture } from '../../../components/PlatformArchitecture';
import { ModulesDeepDive } from '../../../components/ModulesDeepDive';
import { ProductExperience } from '../../../components/ProductExperience';
import { SecurityGovernance } from '../../../components/SecurityGovernance';
import { DemoCTA } from '../../../components/DemoCTA';
import { INDUSTRIES_DATA } from '../../../data/industries';

export const metadata: Metadata = {
  title: 'Giải Pháp Tự Động Hóa Xử Lý Đơn Hàng B2B & Phân Phối Qua Zalo | nexagnet',
  description:
    'Giải pháp AI chuyên sâu cho nhà phân phối và bán buôn: Đọc hiểu tin nhắn Zalo viết tắt, đối soát SKU, kiểm tra hạn mức công nợ và tự động lên đơn KiotViet/ERP chính xác 100%.',
  keywords: [
    'Xử lý đơn hàng Zalo B2B',
    'Tự động hóa đơn hàng đại lý',
    'AI đọc tin nhắn Zalo',
    'Rules engine công nợ đại lý',
    'Tự động hóa KiotViet ERP',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/solutions/b2b-order-processing',
  },
};

export default function B2BOrderProcessingSolutionPage() {
  const otherIndustries = INDUSTRIES_DATA.filter((i) => i.slug !== 'b2b-order-processing');

  return (
    <div className="marketing-page-root">
      <Navbar />

      <main className="solution-deepdive-main">
        {/* Breadcrumb & Hero */}
        <section className="deepdive-hero-section">
          <div className="container">
            <div className="breadcrumb-nav">
              <Link href="/solutions" className="back-link">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M10 12.5L5.5 8L10 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Quay lại Danh mục giải pháp</span>
              </Link>
            </div>

            <div className="deepdive-hero-content text-center">
              <div className="section-eyebrow justify-center">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>CASE STUDY &amp; GIẢI PHÁP CHUYÊN SÂU BÁN BUÔN B2B</span>
              </div>

              <h1 className="deepdive-headline">
                Tự Động Hóa Xử Lý Đơn Hàng B2B
                <br />
                Từ Hàng Trăm Nhóm Zalo Đại Lý.
              </h1>

              <p className="deepdive-subheadline">
                Đọc hiểu tin nhắn đặt hàng không dấu, gõ vội và ảnh chụp bảng kê. Tự động đối soát SKU, kiểm tra hạn mức công nợ và đồng bộ đơn hàng về ERP với độ chính xác tuyệt đối.
              </p>

              <div className="hero-cta-group justify-center">
                <Link href="#demo" className="btn-primary hero-btn-main">
                  <span>Yêu cầu Demo giải pháp B2B</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link href="#modules" className="btn-secondary hero-btn-sub">
                  <span>Khám phá 3 phân hệ vận hành</span>
                </Link>
              </div>
            </div>

            {/* Live Product Experience Showcase Frame */}
            <div className="hero-product-wrapper mt-10">
              <ProductExperience />
            </div>
          </div>
        </section>

        {/* 3-Layer Architecture Deep Dive */}
        <PlatformArchitecture />

        {/* 3 Modules Breakdown (Orders, Knowledge, Campaigns) */}
        <ModulesDeepDive />

        {/* Security & Governance */}
        <SecurityGovernance />

        {/* Cross-Industry Links Section */}
        <section className="cross-industry-section container my-16">
          <h3 className="cross-title">KHÁM PHÁ GIẢI PHÁP CHO CÁC NGÀNH KHÁC:</h3>
          <div className="cross-tags-wrap">
            {otherIndustries.map((ind) => (
              <Link key={ind.slug} href={`/solutions/${ind.slug}`} className="cross-industry-tag">
                <span className="tag-icon">{ind.icon}</span>
                <span>{ind.title}</span>
              </Link>
            ))}
          </div>
        </section>

        <DemoCTA />
      </main>

      <Footer />
    </div>
  );
}
