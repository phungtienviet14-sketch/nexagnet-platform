import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { PageHero } from '@/components/shared/PageHero';
import { IndustryChallenges } from '@/components/shared/IndustryChallenges';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';
import { INDUSTRIES_DATA } from '@/data/industries';

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'real-estate') ?? INDUSTRIES_DATA[2]!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Bất động sản & Sàn Phân phối | nexagnet',
  description:
    'Sàng lọc nhu cầu khách mua, tra cứu tài liệu dự án chính thống và phân luồng lead chất lượng cao cho chuyên viên môi giới.',
  keywords: [
    'AI cho Bất động sản',
    'Sàng lọc lead bất động sản',
    'Tư vấn tài liệu dự án bất động sản',
    'Phân luồng môi giới',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/real-estate',
  },
};

export default function RealEstateIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Bất động sản & Sàn Phân phối' }]}
          eyebrow="ỨNG DỤNG NGÀNH / REAL ESTATE & BROKERAGE"
          badge="BẤT ĐỘNG SẢN & DỰ ÁN"
          title="Giải pháp AI cho Bất động sản & Sàn Phân phối"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Bất động sản"
          supportingPill="Sàng lọc nhu cầu · Gửi tài liệu chính thống · Bàn giao môi giới chuyên trách"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NGÀNH BẤT ĐỘNG SẢN"
          title="Những thách thức trong xử lý lead và phân phối dự án"
          subtitle="Khối lượng lead từ nhiều kênh quảng cáo đổ về dồn dập khiến đội ngũ tư vấn bị quá tải và bỏ lỡ khách hàng tiềm năng."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO BẤT ĐỘNG SẢN"
          title="Sàng lọc chuẩn xác, nâng cao tỷ lệ chuyển đổi."
          subtitle="Tự động hóa trả lời thông số kỹ thuật, mặt bằng và tiến độ để môi giới tập trung dẫn khách xem thực địa."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="LUỒNG XỬ LÝ LEAD DỰ ÁN"
          title="Từ câu hỏi khách hàng đến lịch hẹn xem nhà mẫu."
          subtitle="Quy trình thông suốt giúp phản hồi khách hàng trong vài giây và bàn giao trọn vẹn thông tin cho môi giới."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Thông tin dự án chuẩn xác từ tài liệu chủ đầu tư duyệt."
          desc="Nexagnet tuyệt đối không đưa ra các nhận định đầu tư tài chính suy đoán. Toàn bộ bảng giá, diện tích và chính sách chiết khấu đều bám sát tài liệu công bố chính thức."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Kết hợp các module Nexagnet để quản trị dữ liệu dự án và lead bất động sản."
          items={DATA.relatedModules}
        />

        <FAQAccordion items={DATA.faqs} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
