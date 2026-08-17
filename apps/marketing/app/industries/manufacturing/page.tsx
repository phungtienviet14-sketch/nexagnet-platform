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

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'manufacturing')!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Sản xuất, Gia công & FMCG | nexagnet',
  description:
    'Bóc tách đơn hàng theo mã quy cách vật tư, kiểm soát định mức kỹ thuật và tự động luân chuyển Lệnh sản xuất giữa Kinh doanh, Quản đốc xưởng và Kho.',
  keywords: [
    'AI cho nhà máy sản xuất',
    'AI cho ngành gia công B2B',
    'Bóc tách đơn đặt hàng sản xuất',
    'Luân chuyển lệnh sản xuất',
    'Quản trị xưởng sản xuất',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/manufacturing',
  },
};

export default function ManufacturingIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Sản xuất & Gia công' }]}
          eyebrow="ỨNG DỤNG NGÀNH / MANUFACTURING & FMCG"
          badge="SẢN XUẤT & GIA CÔNG"
          title="Giải pháp AI cho Sản xuất, Gia công & FMCG"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Sản xuất"
          supportingPill="Bóc tách quy cách vật tư · Luân chuyển lệnh sản xuất · Kiểm soát định mức hao hụt"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NHÀ MÁY & XƯỞNG SẢN XUẤT"
          title="Những điểm nghẽn trong tiếp nhận và điều độ sản xuất"
          subtitle="Đơn hàng có nhiều biến thể kỹ thuật phức tạp cùng việc chuyển giao qua chat rời rạc đang dẫn đến rủi ro sản xuất sai quy cách và chậm tiến độ giao hàng."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO NGÀNH SẢN XUẤT"
          title="Thông suốt thông tin từ đơn hàng đến chuyền máy."
          subtitle="Loại bỏ tình trạng hiểu nhầm thông số kỹ thuật, tự động hóa phát hành Lệnh sản xuất và giám sát tiến độ xưởng."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="MINH HỌA LUỒNG VẬN HÀNH"
          title="Từ đơn đặt hàng B2B đến Lệnh sản xuất cho Quản đốc."
          subtitle="Luồng công việc chuẩn hóa giúp kiểm soát nguyên vật liệu và tiến độ từng lô hàng."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Rules Engine đối soát định mức. Quản đốc xưởng ký duyệt lệnh."
          desc="Hệ thống không tự ý cho phép sản xuất khi chưa đủ vật tư hoặc thiếu bản vẽ kỹ thuật. Quản đốc xưởng luôn là người kiểm duyệt cuối cùng trước khi chạy máy."
        />

        <RelatedModules
          title="Các phân hệ nexagnet liên quan"
          subtitle="Khám phá các module nền tảng được phối hợp trong giải pháp sản xuất."
          items={DATA.relatedModules}
        />

        <FAQAccordion
          title="Câu hỏi thường gặp"
          subtitle="Những điều doanh nghiệp sản xuất cần biết trước khi ứng dụng."
          items={DATA.faqs}
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
