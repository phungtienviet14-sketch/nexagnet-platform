import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { PlatformHero } from '@/components/platform/PlatformHero';
import { PlatformOverviewVisual } from '@/components/platform/PlatformHeroVisuals';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Tổng quan Nền tảng AI cho Doanh nghiệp | nexagnet',
  description:
    'Kiến trúc nền tảng AI đa tầng kết nối từ kênh tiếp nhận, trích xuất ngôn ngữ, đối soát quy tắc kinh doanh đến thực thi tác vụ có kiểm soát.',
  alternates: {
    canonical: 'https://nexagnet247.com/platform',
  },
};

const PLATFORM_LAYERS = [
  {
    icon: 'chat',
    title: '1. Tầng Tiếp nhận Kênh (Channel & Ingest)',
    desc: 'Lắng nghe và thu nhận tin nhắn từ các kênh giao tiếp phổ biến (Zalo, Messenger, Web chat) theo kiến trúc không làm gián đoạn trao đổi hiện tại.',
    bullets: ['Hỗ trợ hội thoại văn bản tự nhiên, viết tắt, không dấu', 'Cơ chế Co-pilot dán tay dự phòng linh hoạt', 'Tối thiểu hóa dữ liệu truyền tải theo Luật 91/2025/QH15'],
  },
  {
    icon: 'ai',
    title: '2. Tầng Trích xuất AI (Language Understanding)',
    desc: 'Sử dụng mô hình ngôn ngữ lớn (LLM) để phân loại ý định (7 intent) và trích xuất thực thể theo từ điển đóng (Closed Dictionary).',
    bullets: ['Ép output về JSON Schema cố định qua tool-use', 'Không để AI tự ý suy đoán mức giá hay chính sách', 'Ánh xạ chuẩn xác vào danh mục mã SKU doanh nghiệp'],
  },
  {
    icon: 'rules',
    title: '3. Tầng Quy tắc Nghiệp vụ (Rules Engine)',
    desc: 'Code TypeScript độc lập tính toán chính xác 100% logic kinh doanh: bảng giá theo cấp đại lý, thuế VAT, chiết khấu và hạn mức công nợ.',
    bullets: ['Độc lập hoàn toàn khỏi mô hình AI', 'Đọc trực tiếp từ Nguồn sự thật (Postgres/DB)', 'Không có hiện tượng trôi lệch số liệu hoặc ảo giác'],
  },
  {
    icon: 'governance',
    title: '4. Tầng Kiểm soát & Phân luồng (Governance)',
    desc: 'Định tuyến an toàn: Đơn hàng hợp lệ trong ngưỡng tự động thực thi; các đơn lớn hoặc có cảnh báo chuyển nhân sự phê duyệt.',
    bullets: ['Cổng duyệt Human-in-the-Loop cho nhân sự', 'Nhật ký kiểm toán toàn diện (Audit Trail)', 'Công tắc ngắt khẩn cấp (Kill-switch) tức thì'],
  },
];

const PLATFORM_STEPS = [
  {
    step: 'GIAI ĐOẠN 01',
    tag: 'ĐẦU VÀO KÊNH',
    title: 'Tiếp nhận tin nhắn tự nhiên',
    desc: 'Tin nhắn trao đổi từ nhóm Zalo hoặc kênh chat được tiếp nhận an toàn qua cổng kết nối.',
    example: '“Gui cho c 20 Felix ve kho Nam Dinh nhe”',
  },
  {
    step: 'GIAI ĐOẠN 02',
    tag: 'TRÍCH XUẤT RÀNG BUỘC',
    title: 'AI bóc tách thực thể theo JSON Schema',
    desc: 'AI nhận diện ý định đặt hàng và trích xuất mã sản phẩm, số lượng, địa chỉ giao hàng.',
    example: 'Intent: ORDER · SKU: FLX-01 · SL: 20 · Đích: Kho Nam Định',
  },
  {
    step: 'GIAI ĐOẠN 03',
    tag: 'ĐỐI SOÁT QUY TẮC',
    title: 'Rules Engine tính toán & Kiểm tra điều kiện',
    desc: 'Hệ thống đối chiếu biểu giá đại lý, tính thành tiền và kiểm tra hạn mức công nợ trong cơ sở dữ liệu.',
    example: 'Đơn giá: 1.150k · Tổng: 23.000.000đ · Công nợ: Đạt yêu cầu · Ngưỡng: Trong hạn mức (≤50)',
  },
  {
    step: 'GIAI ĐOẠN 04',
    tag: 'THỰC THI & LƯU VẾT',
    title: 'Gửi xác nhận & Ghi nhật ký kiểm toán',
    desc: 'Tự động gửi tin nhắn xác nhận vào nhóm trao đổi và tạo hàng việc cho nhân sự nhập đơn xuất kho.',
    example: 'Đã gửi xác nhận Zalo · Lưu Audit Log · Thông báo Sales nhận việc',
  },
];

const PLATFORM_FAQS = [
  {
    q: 'Kiến trúc nền tảng nexagnet khác gì so với các chatbot truyền thống?',
    a: 'Khác biệt lớn nhất là nexagnet tách bạch hoàn toàn giữa việc đọc hiểu của AI và việc tính toán quy tắc kinh doanh. AI chỉ đóng vai trò phân loại và trích xuất; mọi phép tính giá, thuế, chiết khấu và hạn mức đều do Rules Engine tất định thực thi từ cơ sở dữ liệu (Source of Truth), loại bỏ 100% nguy cơ AI bịa đặt giá hoặc quyết định sai chính sách.',
  },
  {
    q: 'Nền tảng có hỗ trợ mở rộng thêm các module mới sau này không?',
    a: 'Có. nexagnet được xây dựng theo kiến trúc module hóa đa tầng. Doanh nghiệp có thể bắt đầu với module Xử lý đơn hàng (Order Automation), sau đó mở rộng thêm Tri thức AI (Knowledge), Chiến dịch (Campaigns) hoặc tích hợp ERP qua cổng ErpPort mà không cần đập đi xây lại hệ thống.',
  },
  {
    q: 'Hệ thống bảo vệ dữ liệu doanh nghiệp và khách hàng như thế nào?',
    a: 'nexagnet tuân thủ nghiêm ngặt Luật Bảo vệ Dữ liệu cá nhân (91/2025/QH15 & NĐ 356/2025). Dữ liệu khách hàng được lưu trữ cục bộ, chỉ gửi nội dung văn bản tối thiểu sang LLM để trích xuất và tuyệt đối không chia sẻ cho bên thứ ba ngoài các API đã ký cam kết bảo mật.',
  },
];

export default function PlatformOverviewPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PlatformHero
          breadcrumbs={[{ label: 'Nền tảng', href: '/#platform' }, { label: 'Tổng quan Nền tảng' }]}
          eyebrow="KIẾN TRÚC KỸ THUẬT NỀN TẢNG"
          badge="KIẾN TRÚC ĐA TẦNG"
          title="Một nền tảng AI. Nhiều cách đưa vào doanh nghiệp."
          subtitle="nexagnet kết hợp khả năng đọc hiểu ngôn ngữ tự nhiên của AI với logic quy tắc nghiệp vụ tất định (Rules Engine) và cổng kiểm duyệt của con người để mang lại sự an tâm tuyệt đối trong vận hành."
          primaryCtaText="Yêu cầu Tư vấn Kiến trúc"
          supportingPill="Kiến trúc 4 tầng · Rules Engine tất định · Bảo vệ dữ liệu theo Luật 91/2025"
          visual={<PlatformOverviewVisual />}
        />

        <FeatureGrid
          eyebrow="CẤU TRÚC 4 TẦNG NỀN TẢNG"
          title="Tách bạch rõ ràng giữa AI, Quy tắc và Thực thi."
          subtitle="Không biến AI thành chiếc hộp đen tự quyết định giá cả hay chính sách thương mại của doanh nghiệp."
          features={PLATFORM_LAYERS}
          columns={2}
        />

        <WorkflowPreview
          eyebrow="TIẾN TRÌNH XỬ LÝ KHÉP KÍN"
          title="Cách dữ liệu đi qua 4 tầng của nexagnet."
          subtitle="Từ câu thoại tự nhiên của khách hàng đến giao dịch được kiểm chứng và lưu vết toàn diện."
          steps={PLATFORM_STEPS}
        />

        <ControlCallout
          title="Khám phá chi tiết về Tầng Kiểm soát & Quản trị AI."
          desc="Tìm hiểu cách nexagnet xây dựng Nguồn sự thật (Source of Truth), Cổng duyệt Human-in-the-Loop và Công tắc ngắt khẩn cấp để đảm bảo an toàn tuyệt đối."
        />

        <RelatedModules
          title="Các trang chuyên sâu về Nền tảng"
          subtitle="Tìm hiểu thêm về các khía cạnh quản trị và kết nối hạ tầng của nexagnet."
          items={[
            {
              title: 'Kiểm soát & Quản trị (Control & Governance)',
              desc: 'Chi tiết về Rules Engine, Nhật ký kiểm toán, Phân quyền RBAC và Kill-switch.',
              href: '/platform/control',
              badge: 'Trọng tâm',
            },
            {
              title: 'Hạ tầng Tích hợp (Integrations)',
              desc: 'Triết lý kết nối kênh giao tiếp và phần mềm quản trị doanh nghiệp.',
              href: '/platform/integrations',
            },
            {
              title: 'Lộ trình Phát triển (Roadmap)',
              desc: 'Định hướng mở rộng hệ sinh thái các module vận hành của nexagnet.',
              href: '/resources/roadmap',
            },
          ]}
        />

        <FAQAccordion items={PLATFORM_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
