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

export const metadata: Metadata = {
  title: 'AI Tự động hóa Quy trình Vận hành Doanh nghiệp | nexagnet',
  description:
    'Tự động hóa các tác vụ lặp lại, đối soát dữ liệu đa nguồn và phân luồng an toàn qua các cổng kiểm duyệt nhân sự và Rules Engine tất định.',
  alternates: {
    canonical: 'https://nexagnet247.com/solutions/operations',
  },
};

const OPS_CHALLENGES = [
  {
    num: '01',
    title: 'Thao tác nhập liệu thủ công giữa các phần mềm',
    desc: 'Nhân viên phải liên tục đọc tin nhắn từ Zalo, tra file Excel, rồi gõ lại vào các phần mềm quản lý (KiotViet, SAP, Bravo, Base) — tốn 3–5 phút cho mỗi giao dịch.',
  },
  {
    num: '02',
    title: 'Rủi ro sai lệch dữ liệu và quy tắc nghiệp vụ',
    desc: 'Khi áp lực công việc dồn dập vào cuối tháng hoặc cao điểm, việc nhầm biểu giá, áp sai khuyến mãi hoặc quên kiểm tra hạn mức rất dễ xảy ra.',
  },
  {
    num: '03',
    title: 'Thiếu một lớp kiểm soát và lưu vết tập trung',
    desc: 'Các quy trình diễn ra rải rác trên nhiều nhóm chat và công cụ khác nhau khiến lãnh đạo khó kiểm tra lại ai là người phê duyệt và quyết định trên căn cứ nào.',
  },
];

const OPS_CAPABILITIES = [
  {
    icon: '⚖️',
    title: 'Rules Engine tính toán tất định độc lập',
    desc: 'Tách bạch hoàn toàn giữa việc đọc hiểu của AI và việc tính toán quy tắc kinh doanh. Mọi logic giá, thuế và hạn mức được thực thi bằng mã nguồn độc lập.',
    bullets: ['Tính toán chính xác 100% không có độ lệch', 'Áp dụng biểu quy tắc theo từng cấp đối tác', 'Dễ dàng cập nhật mà không cần huấn luyện lại model'],
  },
  {
    icon: '🛡️',
    title: 'Cổng kiểm duyệt nhân sự (Human-in-the-Loop)',
    desc: 'Thiết lập ngưỡng an toàn rõ ràng: Giao dịch hợp lệ trong hạn mức được xử lý tự động; các trường hợp ngoại lệ chuyển nhân sự duyệt trước khi thực thi.',
    bullets: ['Cài đặt ngưỡng tự động hóa theo từng giai đoạn', 'Hàng việc nhân sự bám theo ngữ cảnh gốc', 'Công tắc ngắt khẩn cấp (Kill-switch) tạm dừng tức thì'],
  },
  {
    icon: '📋',
    title: 'Nhật ký kiểm toán toàn diện (Audit Trail)',
    desc: 'Ghi vết chi tiết từng bước: từ dữ liệu đầu vào, kết quả bóc tách của AI, dữ liệu đối soát quy tắc, đến nội dung gửi đi và người phê duyệt.',
    bullets: ['Tra cứu lại lịch sử mọi giao dịch', 'Minh bạch căn cứ ra quyết định của hệ thống', 'Báo cáo hiệu suất và tỷ lệ tự động hóa theo thời gian'],
  },
];

const OPS_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN DỮ LIỆU',
    title: 'Đọc hiểu yêu cầu từ các kênh trao đổi',
    desc: 'Hệ thống tiếp nhận thông tin từ nhóm Zalo, tin nhắn riêng hoặc phiếu yêu cầu nội bộ.',
    example: 'Yêu cầu: Xuất kho 30 sản phẩm FLX-01 giao về chi nhánh Miền Trung',
  },
  {
    step: 'BƯỚC 02',
    tag: 'ĐỐI SOÁT QUY TẮC',
    title: 'Rules Engine kiểm tra điều kiện nghiệp vụ',
    desc: 'Hệ thống đối soát với bảng giá, tồn kho khả dụng, hạn mức công nợ và các điều khoản thương mại trong Nguồn sự thật.',
    example: 'Kiểm tra 4/4 quy tắc: Biểu giá hợp lệ · Hạn mức công nợ hợp lệ · SL ≤ 50 (Trong ngưỡng)',
  },
  {
    step: 'BƯỚC 03',
    tag: 'PHÂN LUỒNG AN TOÀN',
    title: 'Tự động thực thi hoặc chuyển cấp duyệt',
    desc: 'Nếu đạt mọi điều kiện an toàn, hệ thống tự động phát tin xác nhận; nếu có cảnh báo, chuyển Quản lý duyệt.',
    example: 'Đạt điều kiện: Tự động gửi xác nhận nhóm và tạo hàng việc cho nhân sự',
  },
  {
    step: 'BƯỚC 04',
    tag: 'LƯU VẾT VẬN HÀNH',
    title: 'Ghi nhận nhật ký và đồng bộ dữ liệu',
    desc: 'Toàn bộ tiến trình được ghi vào Nhật ký kiểm toán và sẵn sàng để đồng bộ với phần mềm quản trị.',
    example: 'Lưu Audit Log · Ghi nhận vào hàng việc xuất kho nội bộ',
  },
];

const OPS_FAQS = [
  {
    q: 'Doanh nghiệp có thể tự điều chỉnh các quy tắc kinh doanh mà không cần IT không?',
    a: 'Có. Quản trị viên có thể trực tiếp cập nhật bảng giá, thay đổi hạn mức công nợ hoặc điều chỉnh ngưỡng tự động hóa trên Bảng điều khiển quản trị (Admin Panel) dễ dàng.',
  },
  {
    q: 'Cổng kiểm duyệt Human-in-the-Loop hoạt động như thế nào?',
    a: 'Mỗi khi hệ thống phát hiện đơn hàng vượt hạn mức số lượng, thiếu thông tin người nhận hoặc có sự chênh lệch giá, đơn hàng sẽ không tự gửi mà xuất hiện trên Hàng việc của Sales kèm đề xuất giải pháp để con người quyết định.',
  },
  {
    q: 'Khi xảy ra sự cố kênh liên lạc, làm sao để dừng việc gửi tin tự động?',
    a: 'Hệ thống trang bị sẵn Công tắc ngắt khẩn cấp (Kill-switch) trên giao diện điều hành. Chỉ với 1 thao tác bấm, toàn bộ việc gửi tin tự động sẽ tạm dừng ngay lập tức.',
  },
];

export default function OperationsSolutionPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Giải pháp', href: '/#solutions' }, { label: 'Vận hành Doanh nghiệp' }]}
          eyebrow="GIẢI PHÁP / OPERATIONS & GOVERNANCE"
          badge="KIỂM SOÁT TOÀN DIỆN"
          title="AI Tự động hóa Quy trình Vận hành Doanh nghiệp"
          subtitle="Tự động hóa các tác vụ lặp lại, đối soát dữ liệu đa nguồn và phân luồng an toàn qua các cổng kiểm duyệt nhân sự và Rules Engine tất định."
          primaryCtaText="Yêu cầu Tư vấn Vận hành AI"
          supportingPill="Rules Engine tất định · Cổng duyệt Human-in-the-Loop · Nhật ký kiểm toán"
        />

        <IndustryChallenges
          eyebrow="ĐIỂM NGHẼN VẬN HÀNH HIỆN TẠI"
          title="Những rủi ro khi vận hành bằng các công cụ chắp vá"
          subtitle="Sự thiếu kết nối giữa các kênh giao tiếp và phần mềm quản trị đang làm chậm tốc độ xử lý của doanh nghiệp."
          challenges={OPS_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="TRỤ CỘT KIỂM SOÁT VẬN HÀNH"
          title="Vận hành chính xác, minh bạch và an tâm."
          subtitle="Đảm bảo mọi hành động tự động hóa đều nằm trong giới hạn kiểm soát nghiêm ngặt của ban lãnh đạo."
          features={OPS_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="LUỒNG VẬN HÀNH AN TOÀN"
          title="Cách nexagnet phân luồng và thực thi tác vụ."
          subtitle="Từ tiếp nhận thông tin đến đối soát quy tắc và lưu vết kiểm toán toàn diện."
          steps={OPS_STEPS}
        />

        <ControlCallout
          title="Khám phá sâu hơn về Kiến trúc Kiểm soát & Quản trị nexagnet."
          desc="Tìm hiểu cách chúng tôi thiết kế Nguồn sự thật, Rules Engine tất định và Công tắc ngắt khẩn cấp để bảo vệ hoạt động kinh doanh của bạn."
        />

        <RelatedModules
          title="Các sản phẩm nexagnet liên quan"
          subtitle="Kết hợp giải pháp Vận hành với các module chuyên biệt để xây dựng hệ thống tự động hóa hoàn chỉnh."
          items={[
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Module ứng dụng tiêu biểu của giải pháp vận hành trong xử lý đơn hàng B2B.',
              href: '/products/order-automation',
              badge: 'Tiêu biểu',
            },
            {
              title: 'Kiểm soát & Quản trị Nền tảng',
              desc: 'Chi tiết về kiến trúc bảo mật, phân quyền và lưu vết kiểm toán.',
              href: '/platform/control',
            },
            {
              title: 'Hạ tầng Tích hợp',
              desc: 'Khả năng kết nối với các hệ thống ERP, CRM và phần mềm quản trị.',
              href: '/platform/integrations',
            },
          ]}
        />

        <FAQAccordion items={OPS_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
