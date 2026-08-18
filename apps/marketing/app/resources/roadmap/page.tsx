import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ResourceHero } from '@/components/resources/ResourceHero';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Lộ trình Phát triển Hệ sinh thái | nexagnet',
  description:
    'Định hướng phát triển và mở rộng các phân hệ công nghệ trong hệ sinh thái nexagnet — từ xử lý đơn hàng hội thoại đến nền tảng AI vận hành toàn diện.',
  alternates: {
    canonical: 'https://nexagnet247.com/resources/roadmap',
  },
};

const ROADMAP_PHASES = [
  {
    icon: '🚀',
    title: 'Phân hệ Đang chạy thực tế (Production Core)',
    desc: 'Hạt nhân xử lý đơn hàng hội thoại và cơ chế kiểm soát tất định đã được vận hành thực tế.',
    badge: 'ĐANG CHẠY THỰC TẾ',
    bullets: [
      'Xử lý đơn hàng B2B qua Zalo (đọc viết tắt, không dấu, từ lóng)',
      'Rules Engine tính giá, thuế VAT và công nợ tất định từ Postgres DB',
      'Cổng kiểm duyệt Human-in-the-Loop và Công tắc ngắt khẩn cấp (Kill-switch)',
      'Nhật ký kiểm toán toàn diện (Audit Trail) lưu vết từng giao dịch',
    ],
  },
  {
    icon: '📦',
    title: 'Phân hệ Sẵn sàng triển khai (Configurable Modules)',
    desc: 'Các năng lực đã hoàn thiện cấu trúc và sẵn sàng cấu hình theo yêu cầu của từng doanh nghiệp.',
    badge: 'SẴN SÀNG TRIỂN KHAI',
    bullets: [
      'Quản trị Tri thức AI (Knowledge Base) với RAG trích dẫn căn cứ văn bản',
      'Chiến dịch Giao tiếp (Campaigns) với hàng đợi giãn cách chống khóa kênh',
      'Bảng điều khiển quản trị (Admin Panel) CRUD Nguồn sự thật động',
      'Định tuyến fail-safe và hàng việc nhân sự bám theo ngữ cảnh tin nhắn',
    ],
  },
  {
    icon: '🔌',
    title: 'Tùy chọn Tích hợp Hệ thống (Enterprise Ports)',
    desc: 'Các cổng mở rộng kết nối với hệ thống phần mềm quản trị và kênh giao tiếp bên ngoài.',
    badge: 'TÙY CHỌN TÍCH HỢP',
    bullets: [
      'Cổng ErpPort chuẩn hóa sẵn sàng kết nối API với KiotViet, SAP, Bravo, MISA, Base',
      'Đồng bộ dữ liệu đơn hàng và trạng thái xuất kho hai chiều',
      'Báo cáo phân tích xu hướng đặt hàng và hiệu suất phản hồi theo thời gian thực',
    ],
  },
  {
    icon: '🔮',
    title: 'Định hướng Mở rộng Tương lai (Future Roadmap)',
    desc: 'Các công nghệ nâng cao đang được nghiên cứu và thử nghiệm trong phòng lab.',
    badge: 'ĐANG PHÁT TRIỂN / LAB',
    bullets: [
      'Vision AI: Nhận diện ảnh bảng kê và hóa đơn viết tay trên hội thoại',
      'Voice AI & Tổng đài thông minh: Tương tác qua giọng nói tự nhiên',
      'Custom Workflow Builder: Kéo thả quy trình vận hành và phê duyệt đa cấp',
    ],
  },
];

const ROADMAP_FAQS = [
  {
    q: 'Doanh nghiệp có cần đợi hoàn thiện toàn bộ roadmap mới triển khai không?',
    a: 'Hoàn toàn không. nexagnet được thiết kế theo module độc lập. Doanh nghiệp có thể triển khai ngay các phân hệ cốt lõi đang chạy thực tế (như Order Automation, Knowledge Base) để giải quyết bài toán hiện tại, sau đó nâng cấp các module tiếp theo khi có nhu cầu.',
  },
  {
    q: 'Khi nexagnet ra mắt phiên bản module mới, hệ thống cũ có bị ảnh hưởng không?',
    a: 'Các bản cập nhật của nexagnet tuân thủ nghiêm ngặt tính tương thích ngược và nguyên tắc Nguồn sự thật. Dữ liệu bảng giá, đại lý và nhật ký kiểm toán hiện tại luôn được bảo toàn tuyệt đối.',
  },
];

export default function ResourcesRoadmapPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <ResourceHero
          breadcrumbs={[{ label: 'Tài nguyên', href: '/#resources' }, { label: 'Lộ trình Phát triển' }]}
          eyebrow="ĐỊNH HƯỚNG PHÁT TRIỂN / ECOSYSTEM ROADMAP"
          badge="LỘ TRÌNH MINH BẠCH"
          title="Lộ trình Phát triển Hệ sinh thái nexagnet"
          subtitle="Khám phá các phân hệ công nghệ đang chạy thực tế, các module sẵn sàng triển khai và định hướng mở rộng dài hạn của nền tảng."
          primaryCtaText="Trao đổi về Lộ trình Triển khai"
          supportingPill="Minh bạch trạng thái · Kiến trúc module mở rộng · Đồng hành dài hạn"
        />

        <FeatureGrid
          eyebrow="4 GIAI ĐOẠN PHÁT TRIỂN CÔNG NGHỆ"
          title="Minh bạch giữa năng lực hiện tại và định hướng tương lai."
          subtitle="Chúng tôi phân định rõ ràng trạng thái của từng phân hệ để doanh nghiệp có bức tranh chân thực và an tâm nhất."
          features={ROADMAP_PHASES}
          columns={2}
        />

        <ControlCallout
          title="Bắt đầu từ một quy trình. Mở rộng theo lộ trình vững chắc."
          desc="Không đầu tư dàn trải. Hãy để nexagnet chứng minh hiệu quả trên một bài toán cụ thể trước khi mở rộng ra toàn bộ vận hành công ty."
        />

        <RelatedModules
          title="Các phân hệ công nghệ liên quan"
          subtitle="Khám phá thêm về kiến trúc nền tảng và các module sản phẩm cốt lõi."
          items={[
            {
              title: 'Tổng quan Nền tảng (Platform)',
              desc: 'Xem sơ đồ kiến trúc tổng thể từ tiếp nhận đến thực thi.',
              href: '/platform',
            },
            {
              title: 'Kiểm soát & Quản trị (Control & Governance)',
              desc: 'Chi tiết về Rules Engine, Nhật ký kiểm toán, Phân quyền RBAC và Kill-switch.',
              href: '/platform/control',
              badge: 'Trọng tâm',
            },
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Sản phẩm tiêu biểu đang vận hành thực tế của nexagnet.',
              href: '/products/order-automation',
              badge: 'Tiêu biểu',
            },
          ]}
        />

        <FAQAccordion items={ROADMAP_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
