import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { PageHero } from '@/components/shared/PageHero';
import { ArchitectureThreeLayers } from '@/components/home/ArchitectureThreeLayers';
import { UnifiedControlSection } from '@/components/home/UnifiedControlSection';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Kiểm soát & Quản trị AI Doanh nghiệp (Control & Governance) | nexagnet',
  description:
    'AI mạnh hơn khi doanh nghiệp luôn giữ quyền kiểm soát. Khám phá kiến trúc 3 lớp, Rules Engine tất định, Cổng kiểm duyệt nhân sự và Nhật ký kiểm toán toàn diện của nexagnet.',
  alternates: {
    canonical: 'https://nexagnet247.com/platform/control',
  },
};

const GOVERNANCE_FEATURES = [
  {
    icon: '🗄️',
    title: 'Nguồn sự thật tập trung (Source of Truth)',
    desc: 'Bảng giá, danh mục SKU, thông tin đại lý và chính sách thương mại được lưu trữ trong cơ sở dữ liệu (PostgreSQL/DB). AI và Rules Engine đều đọc trực tiếp từ nguồn này.',
    bullets: ['Quản trị qua Bảng điều khiển Admin Panel', 'Cập nhật giá và đại lý thấy hiệu lực ngay', 'Không lưu dữ liệu rải rác trên file máy tính cá nhân'],
  },
  {
    icon: '⚖️',
    title: 'Rules Engine tất định độc lập',
    desc: 'Tách bạch hoàn toàn khỏi mô hình AI. Toàn bộ phép tính tiền, thuế VAT, chiết khấu và hạn mức công nợ được thực thi bằng mã nguồn TypeScript thuần túy.',
    bullets: ['Tính toán chính xác 100% không có sai số', 'Áp dụng biểu quy tắc riêng theo từng cấp đối tác', 'Không để AI tự suy đoán hay bịa đặt con số'],
  },
  {
    icon: '🛡️',
    title: 'Cổng kiểm duyệt nhân sự (Human-in-the-Loop)',
    desc: 'Thiết lập ngưỡng an toàn rõ ràng: Giao dịch hợp lệ trong hạn mức được gửi xác nhận ngay; các đơn vượt hạn mức hoặc có cảnh báo chuyển Sales duyệt trước.',
    bullets: ['Cài đặt ngưỡng tự động hóa (VD: SL ≤ 50)', 'Hàng việc Sales bám theo ngữ cảnh tin nhắn gốc', 'Quyền quyết định cuối cùng luôn thuộc về con người'],
  },
  {
    icon: '📋',
    title: 'Nhật ký kiểm toán toàn diện (Audit Trail)',
    desc: 'Ghi vết chi tiết từng bước: từ tin nhắn gốc, dữ liệu AI trích xuất, kết quả đối soát quy tắc, đến nội dung gửi đi và người duyệt đơn.',
    bullets: ['Minh bạch căn cứ ra quyết định của hệ thống', 'Tra cứu lại lịch sử mọi giao dịch', 'Xuất báo cáo kiểm toán phục vụ thanh tra nội bộ'],
  },
  {
    icon: '👥',
    title: 'Cổng phân quyền & Phê duyệt nhân sự (RBAC)',
    desc: 'Phân quyền chặt chẽ theo vai trò: Trợ lý bán hàng, Kế toán, Quản trị viên. Đơn vượt hạn mức an toàn luôn yêu cầu quản lý có thẩm quyền duyệt.',
    bullets: ['Tách biệt quyền hạn theo phòng ban', 'Bảo vệ thông tin tài chính và khách hàng nhạy cảm', 'Lưu vết tài khoản phê duyệt từng giao dịch'],
  },
  {
    icon: '🛑',
    title: 'Công tắc ngắt khẩn cấp (Kill-Switch)',
    desc: 'Cho phép quản trị viên tạm dừng gửi tin tự động ngay lập tức trong 1 click khi phát hiện rủi ro kênh trao đổi hoặc sự cố đường truyền.',
    bullets: ['Tạm dừng phát tin tức thì', 'Chuyển toàn bộ luồng sang chế độ duyệt tay', 'Bảo vệ tuyệt đối uy tín của doanh nghiệp'],
  },
];

const CONTROL_FAQS = [
  {
    q: 'Tại sao nexagnet không để AI trực tiếp tính tiền và báo giá?',
    a: 'Mô hình ngôn ngữ lớn (LLM) bản chất là mô hình xác suất, có nguy cơ sinh dữ liệu không chuẩn (ảo giác AI). Trong kinh doanh B2B, sai lệch 1 con số có thể gây thiệt hại hàng trăm triệu đồng. Vì vậy, nexagnet áp dụng nguyên tắc kiến trúc bất biến: AI chỉ trích xuất thông tin; toàn bộ việc tính tiền và áp dụng chính sách do Rules Engine TypeScript tất định 100% thực hiện từ cơ sở dữ liệu.',
  },
  {
    q: 'Doanh nghiệp có thể thay đổi ngưỡng số lượng tự động duyệt đơn không?',
    a: 'Có. Ngưỡng tự động hóa (maxAutoConfirmQuantity) là cấu hình linh hoạt theo từng doanh nghiệp (ví dụ: mặc định là 50 sản phẩm). Quản trị viên có thể điều chỉnh ngưỡng này tăng hoặc giảm bất kỳ lúc nào trên Bảng điều khiển quản trị.',
  },
  {
    q: 'Dữ liệu tin nhắn của chúng tôi có được bảo vệ theo pháp luật không?',
    a: 'Hoàn toàn có. Hệ thống tuân thủ nghiêm ngặt Luật Bảo vệ Dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025. Dữ liệu chỉ được lưu trữ trên hạ tầng bảo mật của doanh nghiệp, mã hóa đường truyền và chỉ gửi nội dung văn bản tối thiểu sang LLM để trích xuất.',
  },
];

export default function PlatformControlPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Nền tảng', href: '/platform' }, { label: 'Kiểm soát & Quản trị' }]}
          eyebrow="TRỌNG TÂM DOANH NGHIỆP / CONTROL & GOVERNANCE"
          badge="AN TOÀN TUYỆT ĐỐI"
          title="AI mạnh hơn khi doanh nghiệp luôn giữ quyền kiểm soát."
          subtitle="Khám phá kiến trúc 3 lớp bảo vệ, Rules Engine tất định, Cổng kiểm duyệt nhân sự và Nhật ký kiểm toán toàn diện giúp doanh nghiệp an tâm khi ứng dụng AI vào vận hành."
          primaryCtaText="Yêu cầu Demo Cơ chế Kiểm soát"
          supportingPill="Rules Engine tất định · Cổng duyệt Human-in-the-Loop · Nhật ký kiểm toán 100%"
        />

        {/* Kiến trúc 3 Lớp Interactive Section */}
        <ArchitectureThreeLayers />

        {/* 6 Trụ cột Kiểm soát Quản trị */}
        <FeatureGrid
          eyebrow="6 TRỤ CỘT KIỂM SOÁT VẬN HÀNH"
          title="Kiểm soát toàn diện từng thao tác tự động hóa."
          subtitle="Không một hành động nào của AI nằm ngoài tầm giám sát và phê duyệt của ban lãnh đạo doanh nghiệp."
          features={GOVERNANCE_FEATURES}
          columns={3}
        />

        {/* Unified Control Section (Source of Truth, Audit Trail, Kill switch) */}
        <UnifiedControlSection />

        <ControlCallout
          title="Sẵn sàng đưa AI vào vận hành với sự an tâm cao nhất?"
          desc="Hãy trao đổi cùng đội ngũ chuyên gia nexagnet để thiết kế khung quy tắc nghiệp vụ và các chốt chặn an toàn phù hợp với mô hình doanh nghiệp của bạn."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Tìm hiểu thêm về hạ tầng kết nối và các module sản phẩm của nexagnet."
          items={[
            {
              title: 'Tổng quan Nền tảng (Platform)',
              desc: 'Xem sơ đồ kiến trúc tổng thể từ tiếp nhận đến thực thi.',
              href: '/platform',
            },
            {
              title: 'Hạ tầng Tích hợp (Integrations)',
              desc: 'Khả năng kết nối với các hệ thống ERP, CRM và phần mềm quản trị.',
              href: '/platform/integrations',
            },
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Trải nghiệm trực quan cách Rules Engine và Cổng duyệt kiểm soát đơn hàng thật.',
              href: '/products/order-automation',
              badge: 'Tiêu biểu',
            },
          ]}
        />

        <FAQAccordion items={CONTROL_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
