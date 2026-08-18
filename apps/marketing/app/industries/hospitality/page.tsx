import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { IndustryHero } from '@/components/industries/IndustryHero';
import { HospitalityVisual } from '@/components/industries/IndustryHeroVisuals';
import { IndustryChallenges } from '@/components/shared/IndustryChallenges';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';
import { INDUSTRIES_DATA } from '@/data/industries';

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'hospitality') ?? INDUSTRIES_DATA[4]!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Khách sạn, Lưu trú & Dịch vụ | nexagnet',
  description:
    'Tự động hóa tiếp nhận yêu cầu đặt phòng, tư vấn dịch vụ tiện ích và phân luồng công việc đa phòng ban (Lễ tân, Buồng phòng, F&B) cho khách sạn và khu nghỉ dưỡng.',
  keywords: [
    'AI cho Khách sạn và Dịch vụ',
    'Tự động hóa dịch vụ phòng khách sạn',
    'Phân luồng yêu cầu buồng phòng',
    'Chăm sóc khách lưu trú 24/7',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/hospitality',
  },
};

export default function HospitalityIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <IndustryHero
          slug="hospitality"
          categoryName="Khách sạn & Nghỉ dưỡng"
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Khách sạn & Nghỉ dưỡng' }]}
          eyebrow="ỨNG DỤNG NGÀNH / HOSPITALITY & GUEST SERVICES"
          badge="KHÁCH SẠN & DỊCH VỤ"
          title="Giải pháp AI cho Khách sạn, Lưu trú & Dịch vụ"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Khách sạn"
          supportingPill="Tư vấn dịch vụ 24/7 · Phân luồng buồng phòng · Giám sát hàng việc liên phòng ban"
          visual={<HospitalityVisual />}
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NGÀNH KHÁCH SẠN"
          title="Những điểm nghẽn trong phục vụ và luân chuyển công việc"
          subtitle="Yêu cầu của khách gửi qua nhiều kênh phân tán khiến Lễ tân phải gọi điện chuyển tay cho Buồng phòng và Nhà hàng, dễ thất lạc và trễ hạn."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO KHÁCH SẠN"
          title="Thông suốt luồng dịch vụ, nâng tầm trải nghiệm lưu trú."
          subtitle="Tự động bóc tách loại yêu cầu và phân bổ tức thì tới đúng nhân sự ca trực phụ trách."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="LUỒNG PHỤC VỤ KHÁCH LƯU TRÚ"
          title="Từ tin nhắn của khách đến yêu cầu được hoàn tất."
          subtitle="Quy trình phối hợp nhịp nhàng giữa AI đọc hiểu, phân luồng tác vụ và nhân sự thực thi."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Giám sát chất lượng phục vụ và thời hạn xử lý (SLA)."
          desc="Mọi yêu cầu của khách đều có thời hạn hoàn thành tiêu chuẩn. Hệ thống tự động cảnh báo cho Quản lý ca trực nếu có công việc bị chậm trễ."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Khám phá các module và phòng ban kết nối trong quản trị khách sạn."
          items={DATA.relatedModules}
        />

        <FAQAccordion items={DATA.faqs} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
