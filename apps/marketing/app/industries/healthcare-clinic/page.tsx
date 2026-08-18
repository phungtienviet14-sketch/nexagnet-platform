import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { IndustryHero } from '@/components/industries/IndustryHero';
import { HealthcareClinicVisual } from '@/components/industries/IndustryHeroVisuals';
import { IndustryChallenges } from '@/components/shared/IndustryChallenges';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';
import { INDUSTRIES_DATA } from '@/data/industries';

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'healthcare-clinic')!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Y tế, Phòng khám & Nha khoa | nexagnet',
  description:
    'Tự động hóa tiếp nhận đặt lịch khám bệnh đa chuyên khoa, tư vấn dịch vụ y tế theo cẩm nang đã duyệt và nhắc lịch tái khám tự động cho phòng khám.',
  keywords: [
    'AI cho phòng khám',
    'AI cho nha khoa',
    'Tự động hóa đặt lịch khám',
    'Chăm sóc bệnh nhân sau khám',
    'AI y tế phòng khám',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/healthcare-clinic',
  },
};

export default function HealthcareClinicIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <IndustryHero
          slug="healthcare-clinic"
          categoryName="Y tế & Phòng khám"
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Y tế & Phòng khám' }]}
          eyebrow="ỨNG DỤNG NGÀNH / HEALTHCARE & CLINIC"
          badge="Y TẾ & PHÒNG KHÁM"
          title="Giải pháp AI cho Y tế, Phòng khám & Nha khoa"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Phòng khám"
          supportingPill="Đặt lịch khám 24/7 · Cẩm nang y khoa chuẩn · Nhắc lịch tái khám tự động"
          visual={<HealthcareClinicVisual />}
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ PHÒNG KHÁM"
          title="Những điểm nghẽn trong tiếp đón và chăm sóc người bệnh"
          subtitle="Áp lực điều phối lịch khám đa bác sĩ và khối lượng cuộc gọi hỏi dịch vụ ngoài giờ làm việc đang tạo ra gánh nặng lớn cho Lễ tân và Điều dưỡng."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO PHÒNG KHÁM"
          title="Chuẩn hóa quy trình tiếp đón và chăm sóc người bệnh."
          subtitle="Tự động xếp lịch, cung cấp thông tin chuẩn xác và duy trì liên lạc chăm sóc sau điều trị."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="MINH HỌA LUỒNG VẬN HÀNH"
          title="Từ tin nhắn đặt lịch đến phiếu tiếp đón bác sĩ."
          subtitle="Quy trình khép kín giúp phân luồng chuyên khoa chính xác và tránh trùng lịch khám."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="AI chỉ xử lý hành chính. Bác sĩ luôn là người quyết định chuyên môn."
          desc="Hệ thống không tự ý đưa ra chẩn đoán hay kê đơn thuốc. Mọi thông tin sức khỏe của bệnh nhân được bảo vệ theo Luật Bảo vệ Dữ liệu Cá nhân 91/2025/QH15."
        />

        <RelatedModules
          title="Các phân hệ nexagnet liên quan"
          subtitle="Khám phá các khối chức năng được cấu hình phối hợp trong giải pháp phòng khám."
          items={DATA.relatedModules}
        />

        <FAQAccordion
          title="Câu hỏi thường gặp"
          subtitle="Những điều cơ sở y tế và nha khoa cần biết trước khi triển khai."
          items={DATA.faqs}
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
