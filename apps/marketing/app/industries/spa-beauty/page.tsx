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

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'spa-beauty') ?? INDUSTRIES_DATA[1]!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Spa, Thẩm mỹ & Chăm sóc Sức khỏe | nexagnet',
  description:
    'Chuẩn hóa quy trình tư vấn dịch vụ, tiếp nhận lịch hẹn và chăm sóc khách hàng đa kênh có kiểm soát cho các chuỗi spa và thẩm mỹ viện.',
  keywords: [
    'AI cho Spa và Thẩm mỹ',
    'Tự động hóa tư vấn dịch vụ spa',
    'Tiếp nhận lịch hẹn spa',
    'Chăm sóc khách hàng thẩm mỹ viện',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/spa-beauty',
  },
};

export default function SpaBeautyIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Spa, Thẩm mỹ & Sức khỏe' }]}
          eyebrow="ỨNG DỤNG NGÀNH / SPA & BEAUTY CARE"
          badge="DỊCH VỤ & LÀM ĐẸP"
          title="Giải pháp AI cho Spa, Thẩm mỹ & Chăm sóc Sức khỏe"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Spa & Làm đẹp"
          supportingPill="Tư vấn dịch vụ 24/7 · Hỗ trợ tiếp nhận lịch · Chăm sóc sau liệu trình"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NGÀNH LÀM ĐẸP"
          title="Những thách thức trong tư vấn và tiếp đón khách hàng"
          subtitle="Khách hàng làm đẹp đòi hỏi sự chăm sóc chu đáo, thông tin rõ ràng và phản hồi nhanh chóng ngay từ lần liên hệ đầu tiên."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO SPA & THẨM MỸ"
          title="Nâng tầm trải nghiệm khách hàng, tối ưu lịch hẹn."
          subtitle="Tự động hóa các tác vụ lặp lại để đội ngũ kỹ thuật viên và lễ tân tập trung tối đa vào chất lượng dịch vụ trực tiếp."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH TIẾP NHẬN & ĐẶT LỊCH"
          title="Từ câu hỏi làm đẹp đến lịch hẹn được xác nhận."
          subtitle="Quy trình chuyên nghiệp, thân thiện và luôn có sự kiểm tra xác nhận của nhân viên lễ tân."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="An toàn thông tin và tuân thủ chuẩn mực ngành dịch vụ."
          desc="Nexagnet không đưa ra các phác đồ y khoa lâm sàng hay chẩn đoán da liễu. Mọi thông tin tư vấn đều bám sát tài liệu dịch vụ đã được cơ sở thẩm định và phê duyệt."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Kết hợp các module Nexagnet để xây dựng trải nghiệm khách hàng toàn diện."
          items={DATA.relatedModules}
        />

        <FAQAccordion items={DATA.faqs} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
