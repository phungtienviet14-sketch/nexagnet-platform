import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { IndustryHero } from '@/components/industries/IndustryHero';
import { FinancialServicesVisual } from '@/components/industries/IndustryHeroVisuals';
import { IndustryChallenges } from '@/components/shared/IndustryChallenges';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';
import { INDUSTRIES_DATA } from '@/data/industries';

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'financial-services')!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Tài chính, Bảo hiểm & Thẩm định | nexagnet',
  description:
    'Tiếp nhận hồ sơ yêu cầu bồi thường bảo hiểm, kiểm tra tính đầy đủ của chứng từ và luân chuyển thẩm định nhanh chóng với Rules Engine tất định.',
  keywords: [
    'AI cho bảo hiểm',
    'AI thẩm định hồ sơ bồi thường',
    'Tự động hóa tiếp nhận claim bảo hiểm',
    'Rules engine kiểm soát tài chính',
    'Xử lý hồ sơ tài chính bảo hiểm',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/financial-services',
  },
};

export default function FinancialServicesIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <IndustryHero
          slug="financial-services"
          categoryName="Tài chính & Bảo hiểm"
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Tài chính & Bảo hiểm' }]}
          eyebrow="ỨNG DỤNG NGÀNH / FINANCIAL & INSURANCE"
          badge="TÀI CHÍNH & BẢO HIỂM"
          title="Giải pháp AI cho Tài chính, Bảo hiểm & Thẩm định"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Tài chính - Bảo hiểm"
          supportingPill="Tiếp nhận hồ sơ đa kênh · Đối soát hạn mức quyền lợi · Lưu vết kiểm toán 100%"
          visual={<FinancialServicesVisual />}
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NGÀNH BẢO HIỂM & TÀI CHÍNH"
          title="Những điểm nghẽn trong tiếp nhận và thẩm định hồ sơ"
          subtitle="Giấy tờ khách hàng gửi bị thiếu hoặc mờ, việc kiểm tra thủ công điều khoản hợp đồng tốn nhiều ngày đang gây chậm trễ chi trả quyền lợi bảo hiểm."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO TÀI CHÍNH & BẢO HIỂM"
          title="Rút ngắn thời gian xử lý hồ sơ từ ngày xuống giờ."
          subtitle="Tự động kiểm tra tính đầy đủ giấy tờ, áp dụng quy tắc quyền lợi tất định và hỗ trợ chuyên viên thẩm định ra quyết định nhanh."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="MINH HỌA LUỒNG VẬN HÀNH"
          title="Từ chứng từ viện phí đến lệnh chi trả bảo hiểm."
          subtitle="Quy trình minh bạch và tuân thủ tuyệt đối các quy định pháp luật hiện hành."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="AI chỉ hỗ trợ chuẩn bị hồ sơ. Quyết định chi tiền do Hội đồng Thẩm định."
          desc="Hệ thống không tự ý duyệt chi trả bồi thường. Mọi lệnh thanh toán đều yêu cầu chữ ký phê duyệt của Chuyên viên thẩm định có thẩm quyền."
        />

        <RelatedModules
          title="Các phân hệ nexagnet liên quan"
          subtitle="Khám phá các khối chức năng được cấu hình phối hợp trong giải pháp tài chính."
          items={DATA.relatedModules}
        />

        <FAQAccordion
          title="Câu hỏi thường gặp"
          subtitle="Những điều tổ chức tài chính và bảo hiểm cần biết trước khi triển khai."
          items={DATA.faqs}
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
