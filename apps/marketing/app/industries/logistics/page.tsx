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

const DATA = INDUSTRIES_DATA.find((i) => i.slug === 'logistics')!;

export const metadata: Metadata = {
  title: 'Giải pháp AI cho Vận tải, Kho bãi & Logistics | nexagnet',
  description:
    'Đọc hiểu vận đơn, tra cứu biểu cước đa phương thức tự động và điều phối xử lý sự cố giao vận theo thời gian thực cho doanh nghiệp logistics và vận tải.',
  keywords: [
    'AI cho logistics',
    'AI cho vận tải đường bộ',
    'Tự động tính cước vận chuyển',
    'Bóc tách vận đơn POD',
    'Điều hành đội xe vận tải',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/industries/logistics',
  },
};

export default function LogisticsIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Vận tải & Logistics' }]}
          eyebrow="ỨNG DỤNG NGÀNH / LOGISTICS & FREIGHT"
          badge="VẬN TẢI & LOGISTICS"
          title="Giải pháp AI cho Vận tải, Kho bãi & Logistics"
          subtitle={DATA.subtitle}
          primaryCtaText="Trao đổi về giải pháp Logistics"
          supportingPill="Báo giá cước tự động · Điều phối chuyến xe · Thu thập chứng từ POD qua chat"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ DOANH NGHIỆP VẬN TẢI"
          title="Những điểm nghẽn trong tính cước và điều phối giao nhận"
          subtitle="Tra cứu bảng cước nhiều tuyến đường thủ công và sự cố chậm hàng không được thông báo kịp thời đang ảnh hưởng trực tiếp đến uy tín dịch vụ giao vận."
          challenges={DATA.painPoints}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO NGÀNH LOGISTICS"
          title="Nâng cao tốc độ phản hồi cước và kiểm soát hành trình."
          subtitle="Bóc tách thông tin tuyến đường, tính cước tất định và thu thập chứng từ bàn giao không cần giấy tờ rời rạc."
          features={DATA.capabilities}
        />

        <WorkflowPreview
          eyebrow="MINH HỌA LUỒNG VẬN HÀNH"
          title="Từ tin nhắn yêu cầu cước đến lệnh điều xe."
          subtitle="Quy trình liên kết chặt chẽ giữa Chủ hàng, Nhân viên Điều vận và Tài xế."
          steps={DATA.workflowSteps}
        />

        <ControlCallout
          title="Biểu cước do Rules tính toán. Điều vận gán xe & phê duyệt."
          desc="Hệ thống tuyệt đối không tự ý suy đoán giá cước ngoài biểu giá đã duyệt. Mọi điều chỉnh phụ phí phát sinh trên đường đều phải có sự xác nhận của Điều vận trưởng."
        />

        <RelatedModules
          title="Các phân hệ nexagnet liên quan"
          subtitle="Khám phá các khối chức năng được cấu hình phối hợp trong giải pháp vận tải."
          items={DATA.relatedModules}
        />

        <FAQAccordion
          title="Câu hỏi thường gặp"
          subtitle="Những điều doanh nghiệp vận tải và kho bãi cần biết trước khi triển khai."
          items={DATA.faqs}
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
