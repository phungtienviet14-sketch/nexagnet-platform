import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { DepartmentHero } from '@/components/departments/DepartmentHero';
import { DepartmentPainPoints } from '@/components/departments/DepartmentPainPoints';
import { DepartmentCapabilities } from '@/components/departments/DepartmentCapabilities';
import { DepartmentWorkflow } from '@/components/departments/DepartmentWorkflow';
import { RelatedDepartments } from '@/components/departments/RelatedDepartments';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'AI Hỗ trợ Phòng Tiếp thị (Marketing) | nexagnet',
  description:
    'Biến dữ liệu và tương tác khách hàng thành workflow có thể theo dõi. Nexagnet hỗ trợ phân loại lead, đồng bộ tri thức chiến dịch và điều phối phát tin an toàn.',
  keywords: [
    'AI cho phòng Marketing',
    'Phân loại lead tự động',
    'Điều phối chiến dịch đa kênh',
    'Đồng bộ dữ liệu Sales và Marketing',
    'Tự động hóa chăm sóc khách hàng',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments/marketing',
  },
};

const MARKETING_PAIN_POINTS = [
  {
    num: '01',
    title: 'Nội dung sản phẩm và thông điệp chiến dịch bị phân tán',
    desc: 'Tài liệu quảng bá, cẩm nang tính năng và hình ảnh nằm rải rác trên Drive, nhóm chat khiến nhân sự mất thời gian tìm kiếm.',
    consequence: 'Thông điệp truyền thông giữa Marketing và Sales không đồng nhất.',
  },
  {
    num: '02',
    title: 'Dữ liệu tương tác khó chuyển hóa thành hành động',
    desc: 'Hàng ngàn tin nhắn phản hồi từ khách hàng quan tâm chiến dịch không được phân loại tự động theo nhu cầu để xử lý kịp thời.',
    consequence: 'Lead tiềm năng bị nguội và lãng phí ngân sách quảng cáo.',
  },
  {
    num: '03',
    title: 'Triển khai thông báo chiến dịch tốn nhiều công thủ công',
    desc: 'Mỗi khi có chính sách giá mới hoặc ưu đãi tháng, nhân sự phải sao chép và gửi tay vào hàng trăm nhóm chat đại lý.',
    consequence: 'Tốn hàng giờ thao tác lặp lại và có nguy cơ bị khóa tài khoản do spam.',
  },
  {
    num: '04',
    title: 'Thiếu vòng lặp phản hồi (Feedback Loop) giữa Sales & Marketing',
    desc: 'Marketing không nắm được lead từ chiến dịch nào có tỷ lệ chốt cao; Sales không biết khách hàng đã nhận được thông điệp ưu đãi gì.',
    consequence: 'Hai phòng ban làm việc rời rạc, khó tối ưu hiệu quả chiến dịch.',
  },
  {
    num: '05',
    title: 'Lead đến dồn dập nhưng khó phân loại chất lượng',
    desc: 'Không có công cụ sàng lọc sơ bộ khiến nhân sự phải tiếp đón cả các câu hỏi vu vơ hoặc spam cùng lúc với khách hàng tiềm năng cao.',
    consequence: 'Quá tải đội ngũ trực kênh và giảm chất lượng phục vụ khách VIP.',
  },
];

const MARKETING_CAPABILITIES = [
  {
    icon: '📢',
    title: 'Điều phối chiến dịch & Phát tin giãn cách',
    desc: 'Lên lịch và gửi thông báo chương trình khuyến mãi, bảng giá mới tới hàng trăm nhóm đại lý theo hàng đợi giãn cách an toàn chống nghẽn kênh.',
    bullets: ['Giãn cách tự động 8–15 giây/nhóm', 'Cá nhân hóa lời chào theo tên đại lý', 'Công tắc dừng phát tin khẩn cấp tức thì'],
  },
  {
    icon: '🎯',
    title: 'Phân loại lead theo ý định & Mức độ quan tâm',
    desc: 'AI tự động đọc hiểu phản hồi của khách hàng sau chiến dịch, phân loại lead theo nhu cầu sản phẩm, ngân sách và thời điểm mua.',
    bullets: ['Phân loại ý định quan tâm, hỏi giá hoặc khiếu nại', 'Gắn thẻ khách hàng theo danh mục sản phẩm', 'Tự động luân chuyển về đội ngũ Sales phụ trách'],
  },
  {
    icon: '📚',
    title: 'Tri thức nội dung & Cẩm nang truyền thông',
    desc: 'Hợp nhất toàn bộ tài liệu bán hàng, brochure kỹ thuật, hình ảnh và video sản phẩm tại một nguồn sự thật duy nhất.',
    bullets: ['Cập nhật một nơi, toàn bộ đội ngũ thấy ngay', 'Tra cứu tức thì theo ngôn ngữ tự nhiên', 'Đảm bảo tính nhất quán của thông điệp thương hiệu'],
  },
  {
    icon: '🔄',
    title: 'Kích hoạt chăm sóc & Tương tác lại tự động',
    desc: 'Thiết lập các luồng kích hoạt chăm sóc định kỳ cho khách hàng cũ hoặc khách hàng đã từng hỏi giá nhưng chưa chốt.',
    bullets: ['Nhắc lịch bảo dưỡng, chăm sóc định kỳ', 'Gửi lời chúc sinh nhật hoặc ưu đãi đặc quyền', 'Phân bổ các lần gửi trong cửa sổ thời gian hợp lý'],
  },
];

const MARKETING_WORKFLOW = [
  {
    step: 'BƯỚC 01',
    tag: 'CHUẨN BỊ CHIẾN DỊCH',
    role: 'human' as const,
    title: 'Marketing soạn nội dung & Cấu hình danh sách',
    desc: 'Nhân sự chuẩn bị nội dung thông báo ưu đãi và chọn nhóm đối tượng mục tiêu trong hệ thống.',
    example: 'Chiến dịch: Thông báo chính sách chiết khấu Quý 3 · Đối tượng: 150 đại lý Cấp 1 & 2',
  },
  {
    step: 'BƯỚC 02',
    tag: 'PHÊ DUYỆT & LÊN LỊCH',
    role: 'rules' as const,
    title: 'Kiểm duyệt nội dung & Phân bổ hàng đợi gửi tin',
    desc: 'Hệ thống kiểm tra nội dung và thiết lập lịch phát tin theo hàng đợi giãn cách an toàn chống spam.',
    example: 'Lịch gửi: 09:00 - 11:30 Thứ Hai · Tốc độ: 10 giây/tin · Đã qua kiểm duyệt',
  },
  {
    step: 'BƯỚC 03',
    tag: 'TIẾP NHẬN PHẢN HỒI',
    role: 'ai' as const,
    title: 'AI đọc hiểu & Phân loại tương tác trả về',
    desc: 'Khi đại lý hoặc khách hàng nhắn tin phản hồi, AI tự động nhận diện ý định đặt hàng hoặc hỏi thêm chi tiết.',
    example: 'Đại lý phản hồi: “Gửi cho chị bảng chi tiết nhé” → Gắn thẻ: Quan tâm Báo giá Q3',
  },
  {
    step: 'BƯỚC 04',
    tag: 'BÀN GIAO SALES',
    role: 'system' as const,
    title: 'Tự động luân chuyển cơ hội kinh doanh cho Sales',
    desc: 'Khách hàng có phản hồi tích cực được đưa thẳng vào Hàng việc của nhân viên Sales phụ trách khu vực.',
    example: 'Đã tạo thẻ Lead nóng cho Sales Miền Bắc · Kèm lịch sử tương tác chiến dịch',
  },
];

const MARKETING_FAQS = [
  {
    q: 'Hệ thống có hỗ trợ tự động chạy quảng cáo Facebook/Google Ads không?',
    a: 'Hiện tại Nexagnet tập trung vào việc quản trị tri thức nội dung, điều phối chiến dịch thông báo đa kênh có sẵn (Zalo, Tin nhắn) và phân loại lead tiếp nhận. Nền tảng không thay thế các công cụ chạy quảng cáo trực tiếp.',
  },
  {
    q: 'Cơ chế gửi tin chiến dịch có làm tài khoản bị khóa do spam không?',
    a: 'Nexagnet áp dụng cơ chế điều phối hàng đợi thông minh: Các tin nhắn được giãn cách an toàn (8–15 giây/tin), cá nhân hóa nội dung theo tên người nhận và có công tắc dừng khẩn cấp (Kill-switch) giúp đảm bảo an toàn tuyệt đối cho tài khoản.',
  },
];

export default function MarketingDepartmentPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <DepartmentHero
          breadcrumbs={[{ label: 'Phòng ban', href: '/departments' }, { label: 'Phòng Tiếp thị (Marketing)' }]}
          eyebrow="ỨNG DỤNG PHÒNG BAN / MARKETING & OUTBOUND"
          badge="TIẾP THỊ & ĐIỀU PHỐI CHIẾN DỊCH"
          title="Biến dữ liệu và tương tác khách hàng thành workflow có thể theo dõi."
          subtitle="Hợp nhất thông điệp chiến dịch, phân loại lead theo nhu cầu và kích hoạt các luồng thông báo, chăm sóc tự động theo hàng đợi an toàn."
          primaryCtaText="Trao đổi về giải pháp Marketing"
          supportingPill="Điều phối chiến dịch giãn cách · Phân loại lead tự động · Nguồn tri thức tập trung"
        />

        <DepartmentPainPoints
          eyebrow="ĐIỂM NGHẼN PHÒNG TIẾP THỊ"
          title="Tại sao chiến dịch tiếp thị thường khó đo lường và tốn công?"
          subtitle="Khi không có sự kết nối giữa thông điệp truyền thông và luồng xử lý thực tế của Sales, nhiều cơ hội kinh doanh sẽ bị bỏ lỡ."
          points={MARKETING_PAIN_POINTS}
        />

        <DepartmentCapabilities
          eyebrow="NĂNG LỰC HỖ TRỢ MARKETING"
          title="Tự động hóa thông điệp, nuôi dưỡng lead chuẩn xác."
          subtitle="Giúp đội ngũ Marketing dễ dàng lan tỏa chính sách mới và chuyển hóa tương tác thành cơ hội bán hàng."
          capabilities={MARKETING_CAPABILITIES}
          columns={2}
        />

        <DepartmentWorkflow
          eyebrow="LUỒNG CHIẾN DỊCH & PHÂN LOẠI LEAD"
          title="Từ phát động chiến dịch đến cơ hội bán hàng cho Sales."
          subtitle="Quy trình khép kín giúp kiểm soát 100% nội dung phát đi và nắm bắt phản hồi của đối tác."
          steps={MARKETING_WORKFLOW}
          governanceNote="Chiến dịch phát tin bắt buộc qua bước duyệt của Quản lý Marketing trước khi hệ thống kích hoạt hàng đợi gửi tin."
        />

        <RelatedModules
          title="Các sản phẩm Nexagnet liên quan"
          subtitle="Khám phá các module công nghệ hỗ trợ đắc lực cho phòng Marketing."
          items={[
            {
              title: 'Điều phối Chiến dịch (Campaigns)',
              desc: 'Lên lịch và gửi thông báo theo hàng đợi giãn cách an toàn.',
              href: '/products/campaigns',
              badge: 'Tiêu biểu',
            },
            {
              title: 'Tri thức Doanh nghiệp (Knowledge)',
              desc: 'Hợp nhất catalogue, hình ảnh và tài liệu bán hàng chuẩn.',
              href: '/products/knowledge',
            },
            {
              title: 'Phòng Bán hàng (Sales)',
              desc: 'Chuyển giao lead từ chiến dịch cho đội ngũ kinh doanh chốt đơn.',
              href: '/departments/sales',
            },
          ]}
        />

        <RelatedDepartments
          title="Khám phá các phòng ban liên quan"
          subtitle="Xem cách phòng Marketing kết nối với Sales, CSKH và Ban Giám đốc."
          currentDeptSlug="marketing"
        />

        <FAQAccordion items={MARKETING_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
