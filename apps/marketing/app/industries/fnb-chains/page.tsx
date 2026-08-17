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

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'fnb-chains')!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Chuỗi Nhà hàng, F&B & Nhượng quyền | nexagnet',
  description:
    'Tự động hóa tiếp nhận đặt bàn cao điểm đa kênh, kiểm soát tiêu chuẩn phục vụ và điều phối nguyên liệu từ Bếp trung tâm cho chuỗi cơ sở F&B.',
  keywords: [
    'AI cho nhà hàng',
    'AI cho chuỗi F&B',
    'Tự động hóa đặt bàn nhà hàng',
    'Điều phối Bếp trung tâm F&B',
    'Chăm sóc khách hàng nhà hàng',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/fnb-chains',
  },
};

export default function FnbChainsIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Chuỗi Nhà hàng & F&B' }]}
          eyebrow="ỨNG DỤNG NGÀNH / RESTAURANT & F&B"
          badge="F&B & CHUỖI NHÀ HÀNG"
          title="Giải pháp AI cho Chuỗi Nhà hàng, F&B & Nhượng quyền"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Chuỗi F&B"
          supportingPill="Tiếp nhận đặt bàn 24/7 · Điều phối Bếp trung tâm · Phân luồng sự cố tức thì"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ CHUỖI NHÀ HÀNG"
          title="Những điểm nghẽn trong phục vụ cao điểm và cung ứng chi nhánh"
          subtitle="Dồn dập tin nhắn đặt bàn vào giờ ăn cùng việc các chi nhánh gửi đơn đặt nguyên liệu về Bếp trung tâm lộn xộn đang làm giảm hiệu quả vận hành chuỗi."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO NGÀNH F&B"
          title="Phục vụ nhanh chóng, chuẩn hóa chuỗi cung ứng."
          subtitle="Tự động bóc tách thông tin đặt bàn, tổng hợp kế hoạch chuẩn bị nguyên liệu cho Bếp trung tâm và xử lý khiếu nại không bị bỏ sót."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="MINH HỌA LUỒNG VẬN HÀNH"
          title="Từ tin nhắn đặt bàn tiệc đến sơ đồ chuẩn bị tại chi nhánh."
          subtitle="Luồng công việc tự động giúp thu tiền cọc đúng chính sách và tránh thất lạc bàn đoàn đông."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Chính sách cọc do Rules kiểm tra. Quản lý chi nhánh xếp bàn."
          desc="Hệ thống tự động áp dụng quy tắc đặt cọc cho bàn đoàn đông và khung giờ cao điểm. Quản lý cơ sở luôn là người xác nhận vị trí bàn và kiểm tra khâu chuẩn bị."
        />

        <RelatedModules
          title="Các phân hệ nexagnet liên quan"
          subtitle="Khám phá các khối chức năng được cấu hình phối hợp trong giải pháp chuỗi nhà hàng."
          items={DATA.relatedModules}
        />

        <FAQAccordion
          title="Câu hỏi thường gặp"
          subtitle="Những điều chuỗi nhà hàng và F&B cần biết trước khi triển khai."
          items={DATA.faqs}
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
