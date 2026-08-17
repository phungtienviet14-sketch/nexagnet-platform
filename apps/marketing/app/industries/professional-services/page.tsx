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

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'professional-services')!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Luật, Thuế & Dịch vụ Doanh nghiệp | nexagnet',
  description:
    'Tư vấn biểu phí và thủ tục hành chính niêm yết, thu thập hồ sơ pháp lý ban đầu và luân chuyển cho luật sư, chuyên viên kế toán phụ trách.',
  keywords: [
    'AI cho công ty luật',
    'AI cho đại lý thuế kế toán',
    'Tự động hóa tiếp nhận hồ sơ pháp lý',
    'Tra cứu thủ tục hành chính doanh nghiệp',
    'Quản trị hồ sơ dịch vụ doanh nghiệp',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/professional-services',
  },
};

export default function ProfessionalServicesIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Luật & Dịch vụ Doanh nghiệp' }]}
          eyebrow="ỨNG DỤNG NGÀNH / LEGAL & CONSULTING"
          badge="LUẬT & TƯ VẤN"
          title="Giải pháp AI cho Luật, Thuế & Dịch vụ Doanh nghiệp"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Tư vấn - Pháp lý"
          supportingPill="Tư vấn biểu phí niêm yết · Thu thập hồ sơ đầu vào · Cảnh báo hạn nộp cơ quan nhà nước"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ CÔNG TY TƯ VẤN & PHÁP LÝ"
          title="Những điểm nghẽn trong tiếp nhận và chuẩn bị hồ sơ"
          subtitle="Chuyên viên mất nhiều thời gian trả lời lặp lại các câu hỏi thủ tục cơ bản cùng việc thu thập giấy tờ rải rác đang làm chậm tiến độ xử lý hồ sơ chuyên sâu."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO DỊCH VỤ DOANH NGHIỆP"
          title="Giải phóng thời gian chuyên viên, chuẩn hóa hồ sơ."
          subtitle="Tự động tra cứu cẩm nang thủ tục, gom đủ thông tin khách hàng và theo dõi thời hạn nộp hồ sơ không để trễ hẹn."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="MINH HỌA LUỒNG VẬN HÀNH"
          title="Từ câu hỏi thành lập doanh nghiệp đến phân công Luật sư."
          subtitle="Hồ sơ được gom đủ giấy tờ đầu vào trước khi bàn giao cho Luật sư soạn thảo điều lệ."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="AI thu thập thông tin. Luật sư & Kế toán viên chịu trách nhiệm pháp lý."
          desc="Hệ thống không tự ý tư vấn các vấn đề pháp lý phức tạp ngoài cẩm nang đã duyệt. Mọi văn bản pháp lý và tờ khai thuế đều do Luật sư/Kế toán viên có chứng chỉ hành nghề ký tên."
        />

        <RelatedModules
          title="Các phân hệ nexagnet liên quan"
          subtitle="Khám phá các khối chức năng được cấu hình phối hợp trong giải pháp dịch vụ doanh nghiệp."
          items={DATA.relatedModules}
        />

        <FAQAccordion
          title="Câu hỏi thường gặp"
          subtitle="Những điều công ty luật và đại lý thuế cần biết trước khi triển khai."
          items={DATA.faqs}
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
