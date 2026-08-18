import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { IndustryHero } from '@/components/industries/IndustryHero';
import { EducationVisual } from '@/components/industries/IndustryHeroVisuals';
import { IndustryChallenges } from '@/components/shared/IndustryChallenges';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';
import { INDUSTRIES_DATA } from '@/data/industries';

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'education') ?? INDUSTRIES_DATA[3]!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Giáo dục & Tuyển sinh | nexagnet',
  description:
    'Chuẩn hóa quy trình tư vấn tuyển sinh, giải đáp chương trình học và biểu phí niêm yết, hỗ trợ tiếp nhận đăng ký thi thử cho các trường học và trung tâm đào tạo.',
  keywords: [
    'AI cho Giáo dục',
    'Tư vấn tuyển sinh tự động',
    'Giải đáp học phí khóa học',
    'Tiếp nhận đăng ký thi thử',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/education',
  },
};

export default function EducationIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <IndustryHero
          slug="education"
          categoryName="Giáo dục & Tuyển sinh"
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Giáo dục & Tuyển sinh' }]}
          eyebrow="ỨNG DỤNG NGÀNH / EDUCATION & ADMISSIONS"
          badge="GIÁO DỤC & TUYỂN SINH"
          title="Giải pháp AI cho Giáo dục & Tuyển sinh"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Giáo dục"
          supportingPill="Tư vấn khóa học 24/7 · Biểu phí niêm yết · Đăng ký thi thử & Tư vấn 1-1"
          visual={<EducationVisual />}
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ MÙA TUYỂN SINH"
          title="Những thách thức trong tư vấn và tiếp nhận học viên"
          subtitle="Áp lực câu hỏi dồn dập trong mùa cao điểm khiến bộ phận tuyển sinh dễ quá tải và báo sai thông tin học phí, lịch học."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO GIÁO DỤC"
          title="Tư vấn chuẩn xác, tối ưu hóa quy trình nhập học."
          subtitle="Tự động giải đáp các thông tin giáo trình và biểu phí để tư vấn viên tập trung định hướng chuyên sâu cho từng học viên."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="LUỒNG TUYỂN SINH & XẾP LỊCH THI THỬ"
          title="Từ câu hỏi của người học đến hồ sơ nhập học hoàn thiện."
          subtitle="Quy trình chuyên nghiệp, minh bạch và luôn có sự đồng hành của chuyên viên tư vấn."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Học phí và chính sách học bổng được kiểm soát chặt chẽ."
          desc="AI tuyệt đối không tự ý thay đổi mức học phí hay cam kết ưu đãi ngoài danh mục. Mọi trường hợp miễn giảm đặc biệt đều qua cổng duyệt của Ban Tuyển sinh."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Kết hợp các module Nexagnet để quản trị dữ liệu khóa học và tuyển sinh."
          items={DATA.relatedModules}
        />

        <FAQAccordion items={DATA.faqs} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
