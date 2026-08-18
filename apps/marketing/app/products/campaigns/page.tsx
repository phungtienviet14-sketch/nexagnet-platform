import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ProductHero } from '@/components/products/ProductHero';
import { CampaignsHeroVisual } from '@/components/products/ProductHeroVisuals';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Điều phối Chiến dịch (Campaign Orchestration) | nexagnet',
  description:
    'Lên lịch và gửi thông báo chính sách, bảng giá mới và chăm sóc khách hàng theo hàng đợi giãn cách an toàn, chống nghẽn kênh và có kiểm soát phê duyệt.',
  keywords: [
    'Campaign Orchestration nexagnet',
    'Điều phối chiến dịch đa kênh',
    'Gửi thông báo Zalo đại lý an toàn',
    'Hàng đợi giãn cách chống spam',
    'Tự động hóa phát tin có kiểm soát',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/products/campaigns',
  },
};

const CAMPAIGN_FEATURES = [
  {
    icon: 'queue',
    title: 'Hàng đợi phát tin giãn cách an toàn',
    desc: 'Không bắn tin đồng loạt gây nghẽn đường truyền. Hệ thống tự động phân bổ và giãn cách thời gian (8–15 giây/nhóm) để đảm bảo an toàn cho tài khoản.',
    bullets: ['Giãn cách thông minh chống cơ chế chặn spam', 'Phân bổ đều trong cửa sổ thời gian cấu hình', 'Không giữ request HTTP bằng vòng sleep giả lập'],
  },
  {
    icon: 'campaign',
    title: 'Phân đoạn đối tượng & Cá nhân hóa thông điệp',
    desc: 'Gửi đúng nội dung tới đúng nhóm đối tác: Đại lý Cấp 1, CTV hay khách hàng thân thiết với lời chào cá nhân hóa theo từng đại lý.',
    bullets: ['Lọc danh sách theo phân cấp đối tác', 'Tự động chèn tên và mã đối tác vào nội dung', 'Tăng tỷ lệ mở và phản hồi tích cực'],
  },
  {
    icon: 'kill-switch',
    title: 'Công tắc dừng khẩn cấp (Kill-Switch) tức thì',
    desc: 'Cho phép người quản lý tạm dừng toàn bộ hàng đợi phát tin ngay lập tức chỉ với 1 click khi phát hiện sai lệch nội dung hoặc sự cố đường truyền.',
    bullets: ['Dừng hàng đợi phát tin ngay lập tức', 'Bảo vệ uy tín và mối quan hệ với đại lý', 'Báo cáo chi tiết số lượng tin đã gửi và còn tồn'],
  },
  {
    icon: 'refresh',
    title: 'Tự động đọc hiểu phản hồi trả về',
    desc: 'Khi đại lý hoặc khách hàng phản hồi sau chiến dịch, AI tự động nhận diện ý định và chuyển thẳng cho nhân viên Sales phụ trách chăm sóc.',
    bullets: ['Phân loại phản hồi tích cực, hỏi thêm hay khiếu nại', 'Chuyển giao cơ hội kinh doanh cho Sales', 'Khép kín vòng lặp từ tiếp thị đến chốt đơn'],
  },
];

const CAMPAIGN_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'SOẠN THẢO BẢN NHÁP',
    title: 'Nhân sự chuẩn bị nội dung & Chọn nhóm đại lý',
    desc: 'Soạn thảo thông điệp chính sách mới, đính kèm bảng giá và chọn phân khúc đại lý mục tiêu.',
    example: 'Chiến dịch: Ra mắt Quạt đứng FLX-01 · Nhóm mục tiêu: 120 Đại lý Miền Bắc',
  },
  {
    step: 'BƯỚC 02',
    tag: 'PHÊ DUYỆT NỘI DUNG',
    title: 'Quản lý kiểm duyệt & Ký duyệt phát hành',
    desc: 'Trưởng phòng Sales hoặc Marketing xem lại bản xem trước (preview) và phê duyệt nội dung.',
    example: 'Quản lý duyệt: Nội dung chuẩn · Lịch phát tin: 09:30 Thứ Ba',
  },
  {
    step: 'BƯỚC 03',
    tag: 'PHÁT TIN GIÃN CÁCH',
    title: 'Hệ thống tự động phát tin theo hàng đợi an toàn',
    desc: 'Hệ thống gửi lần lượt tới từng nhóm trao đổi với khoảng giãn cách ngẫu nhiên 10–15 giây.',
    example: 'Tiến độ: 45/120 nhóm · Tốc độ: 12s/nhóm · Trạng thái: Bình thường',
  },
  {
    step: 'BƯỚC 04',
    tag: 'THEO DÕI & CHĂM SÓC',
    title: 'Thu nhận phản hồi & Luân chuyển cho Sales',
    desc: 'AI đọc hiểu tin nhắn phản hồi của đại lý và tạo thẻ việc để Sales liên hệ tư vấn chốt đơn.',
    example: 'Có 18 đại lý hỏi giá sỉ · Tự động tạo thẻ việc chăm sóc cho Sales khu vực',
  },
];

const CAMPAIGN_FAQS = [
  {
    q: 'Chiến dịch phát tin có thể dùng cho những mục đích nào?',
    a: 'Doanh nghiệp có thể sử dụng cho: Thông báo bảng giá mới, chương trình chiết khấu tháng, thông báo lịch nghỉ lễ, nhắc lịch hẹn bảo dưỡng hoặc gửi lời chúc tri ân khách hàng thân thiết.',
  },
  {
    q: 'Hệ thống có gửi tin rác vào các nhóm chat không liên quan không?',
    a: 'Không. Hệ thống chỉ gửi tin vào đúng danh sách nhóm trao đổi hoặc đối tác đã được xác thực và gán nhãn chính xác trong cơ sở dữ liệu (Source of Truth).',
  },
];

export default function CampaignsProductPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <ProductHero
          moduleCode="MODULE 03"
          moduleName="Campaigns"
          badge="PHÁT TIN AN TOÀN & CÓ KIỂM SOÁT"
          breadcrumbs={[{ label: 'Sản phẩm', href: '/#products' }, { label: 'Điều phối Chiến dịch (Campaigns)' }]}
          title="Điều phối Chiến dịch & Thông báo đa kênh (Campaigns)"
          subtitle="Lên lịch và gửi thông báo chính sách, bảng giá mới và chăm sóc khách hàng theo hàng đợi giãn cách an toàn, chống nghẽn kênh và có cổng duyệt của quản lý."
          primaryCtaText="Trao đổi về Campaign Orchestration"
          supportingPill="Hàng đợi giãn cách an toàn · Phân đoạn đối tượng · Kill-switch dừng khẩn cấp"
          visual={<CampaignsHeroVisual />}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CỦA CAMPAIGN ORCHESTRATION"
          title="Lan tỏa thông điệp chính xác, bảo vệ an toàn tài khoản."
          subtitle="Giải phóng nhân sự khỏi việc sao chép tin nhắn thủ công và mang lại sự an tâm tuyệt đối khi phát thông báo diện rộng."
          features={CAMPAIGN_FEATURES}
          columns={2}
        />

        <WorkflowPreview
          eyebrow="TIẾN TRÌNH ĐIỀU PHỐI CHIẾN DỊCH"
          title="Từ bản nháp nội dung đến cơ hội kinh doanh mới."
          subtitle="Quy trình 4 bước chuẩn mực với cổng kiểm duyệt nhân sự trước khi kích hoạt phát tin."
          steps={CAMPAIGN_STEPS}
        />

        <ControlCallout
          title="Luôn có cổng kiểm duyệt của Quản lý trước khi phát tin."
          desc="Không có tin nhắn nào tự động phát tán mà không có sự đồng ý của quản lý. Bản xem trước (preview) và công tắc dừng khẩn cấp giúp bạn luôn kiểm soát 100% tình hình."
        />

        <RelatedModules
          title="Các phòng ban ứng dụng Campaign Orchestration"
          subtitle="Khám phá cách Marketing, Sales và CSKH phối hợp điều phối chiến dịch."
          items={[
            {
              title: 'Phòng Tiếp thị (Marketing)',
              desc: 'Điều phối các chiến dịch khuyến mãi và thông báo sản phẩm mới.',
              href: '/departments/marketing',
            },
            {
              title: 'Phòng Bán hàng (Sales)',
              desc: 'Gửi bảng giá tháng và chính sách chiết khấu tới mạng lưới đại lý.',
              href: '/departments/sales',
            },
            {
              title: 'Chăm sóc Khách hàng (CSKH)',
              desc: 'Kích hoạt tin nhắn chăm sóc và hướng dẫn sử dụng định kỳ.',
              href: '/departments/customer-service',
            },
          ]}
        />

        <FAQAccordion items={CAMPAIGN_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
