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

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'construction-interior')!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Xây dựng, Nội thất & Vật liệu | nexagnet',
  description:
    'Bóc tách dự toán sơ bộ từ yêu cầu công trình, kiểm soát đề xuất cấp vật tư công trường và theo dõi nghiệm thu giai đoạn cho doanh nghiệp xây dựng, nội thất.',
  keywords: [
    'AI cho xây dựng',
    'AI cho thiết kế thi công nội thất',
    'Bóc tách dự toán BOQ công trình',
    'Quản lý vật tư công trường',
    'Nghiệm thu công trình xây dựng',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/construction-interior',
  },
};

export default function ConstructionInteriorIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Xây dựng & Nội thất' }]}
          eyebrow="ỨNG DỤNG NGÀNH / CONSTRUCTION & INTERIOR"
          badge="XÂY DỰNG & NỘI THẤT"
          title="Giải pháp AI cho Xây dựng, Nội thất & Vật liệu"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Xây dựng"
          supportingPill="Dự toán sơ bộ nhanh · Kiểm soát vật tư công trường · Nghiệm thu giai đoạn"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ DOANH NGHIỆP THI CÔNG"
          title="Những điểm nghẽn trong bóc tách dự toán và quản trị vật tư"
          subtitle="Tốc độ phản hồi báo giá chậm và việc cấp phát vật tư ngoài công trường không kiểm soát đang gây thất thoát ngân sách dự án thi công."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO NGÀNH THI CÔNG & NỘI THẤT"
          title="Kiểm soát ngân sách vật tư và đẩy nhanh tiến độ báo giá."
          subtitle="Bóc tách khối lượng sơ bộ tức thì, cảnh báo vượt định mức vật tư và lưu trữ nhật ký nghiệm thu minh bạch."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="MINH HỌA LUỒNG VẬN HÀNH"
          title="Từ danh mục hạng mục căn hộ đến bảng dự toán chi tiết."
          subtitle="Quy trình liên kết chặt chẽ giữa Chủ đầu tư, Kỹ sư QS và Chỉ huy trưởng công trình."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Đơn giá theo biểu duyệt. Kỹ sư QS & Giám đốc ký duyệt phát sinh."
          desc="Hệ thống không tự ý áp dụng đơn giá ngoài danh mục niêm yết. Mọi đề xuất cấp vật tư phát sinh ngoài hợp đồng đều bắt buộc phải có chữ ký của Chỉ huy trưởng và Ban Giám đốc."
        />

        <RelatedModules
          title="Các phân hệ nexagnet liên quan"
          subtitle="Khám phá các khối chức năng được cấu hình phối hợp trong giải pháp xây dựng và nội thất."
          items={DATA.relatedModules}
        />

        <FAQAccordion
          title="Câu hỏi thường gặp"
          subtitle="Những điều nhà thầu và công ty nội thất cần biết trước khi ứng dụng."
          items={DATA.faqs}
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
