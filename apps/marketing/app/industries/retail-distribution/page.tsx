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

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'retail-distribution') ?? INDUSTRIES_DATA[0]!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Bán lẻ & Phân phối (B2B) | nexagnet',
  description:
    'Giải quyết bài toán vận hành dồn đơn Zalo cao điểm, tin nhắn viết tắt, tra cứu bảng giá đại lý và kiểm soát hạn mức công nợ an toàn cho doanh nghiệp phân phối sỉ.',
  keywords: [
    'AI cho bán lẻ và phân phối',
    'AI xử lý đơn hàng B2B',
    'Tự động hóa đơn hàng Zalo đại lý',
    'Rules Engine công nợ đại lý',
    'AI cho doanh nghiệp phân phối sỉ',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/retail-distribution',
  },
};

export default function RetailDistributionIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Bán lẻ & Phân phối' }]}
          eyebrow="ỨNG DỤNG NGÀNH / RETAIL & DISTRIBUTION"
          badge="B2B & ĐẠI LÝ"
          title="Giải pháp AI cho Bán lẻ & Phân phối (B2B)"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Phân phối"
          supportingPill="Xử lý đơn hàng Zalo · Đối soát giá đại lý · Kiểm soát hạn mức công nợ"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NGÀNH PHÂN PHỐI"
          title="Những điểm nghẽn trong vận hành đại lý và kênh sỉ"
          subtitle="Quản lý hàng trăm nhóm chat trao đổi hàng ngày bằng phương pháp thủ công đang tạo ra áp lực khổng lồ cho đội ngũ bán hàng và kho vận."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO NGÀNH PHÂN PHỐI"
          title="Tự động hóa chính xác, giải phóng sức lao động."
          subtitle="Giải quyết dứt điểm tình trạng đọc nhầm mã, gõ sai giá và chậm trễ phản hồi trong giờ cao điểm."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="LUỒNG XỬ LÝ ĐƠN HÀNG PHÂN PHỐI"
          title="Từ tin nhắn đại lý đến đơn hàng chuẩn xác."
          subtitle="Mọi đơn hàng đều được đối soát qua Nguồn sự thật trước khi phát tin xác nhận."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Chính sách giá và hạn mức công nợ được bảo vệ tuyệt đối."
          desc="Rules Engine độc lập tính toán chính xác 100% theo cấp đối tác. Đơn hàng vượt hạn mức an toàn luôn chuyển giao cho Quản lý phê duyệt."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Khám phá các module và phòng ban kết nối trong ngành phân phối."
          items={DATA.relatedModules}
        />

        <FAQAccordion items={DATA.faqs} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
