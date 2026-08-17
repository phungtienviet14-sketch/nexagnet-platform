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
  title: 'AI cho Doanh nghiệp Bán lẻ & Phân phối (B2B) | nexagnet',
  description:
    'nexagnet có thể hỗ trợ các doanh nghiệp bán lẻ và phân phối tự động hóa tiếp nhận đơn hàng Zalo, tra cứu bảng giá đại lý và kiểm soát hạn mức công nợ an toàn.',
  alternates: {
    canonical: 'https://nexagnet247.com/industries/retail-distribution',
  },
};

const RETAIL_CHALLENGES = [
  {
    num: '01',
    title: 'Hàng trăm nhóm Zalo đại lý dồn đơn cao điểm',
    desc: 'Doanh nghiệp phân phối thường vận hành từ 100 đến hơn 300 nhóm Zalo. Đơn hàng gửi về rải rác cả ngày lẫn đêm khiến nhân sự dễ bỏ sót hoặc phản hồi chậm trễ.',
  },
  {
    num: '02',
    title: 'Tin nhắn gõ vội, viết tắt và ảnh bảng kê',
    desc: 'Đại lý nhắn tin không dấu, dùng từ lóng địa phương (VD: "TN" = Thái Nguyên, "Felix" = Mã FLX-01) hoặc gửi ảnh chụp hóa đơn viết tay, không thể xử lý bằng bot thông thường.',
  },
  {
    num: '03',
    title: 'Nghẽn cổ chai đối soát giá và hạn mức công nợ',
    desc: 'Nhân viên sales phải liên tục tra cứu file Excel giá, kiểm tra tồn kho chi nhánh, rồi gõ tay lại vào phần mềm quản lý — tốn 3–5 phút cho mỗi đơn.',
  },
];

const RETAIL_FEATURES = [
  {
    icon: '📝',
    title: 'Tự động hóa xử lý đơn hàng B2B',
    desc: 'Đọc hiểu tin nhắn viết tắt, trích xuất mã sản phẩm, số lượng, địa chỉ giao và đối soát giá theo cấp đại lý ngay khi nhận tin.',
    bullets: ['Bóc tách đơn hàng theo JSON Schema đóng', 'Tính toán biểu giá và thuế VAT tất định', 'Gửi tin xác nhận vào nhóm Zalo tự động'],
  },
  {
    icon: '💳',
    title: 'Đối soát chính sách thanh toán & Công nợ',
    desc: 'Tự động nhận diện và đối soát đúng điều khoản tài chính (công nợ 30/45 ngày, ký gửi, thanh toán ngay, COD) theo từng hồ sơ đối tác.',
    bullets: ['Kiểm tra hạn mức công nợ khả dụng', 'Cảnh báo khi đối tác có nợ quá hạn', 'Áp dụng chiết khấu bậc thang chính xác'],
  },
  {
    icon: '📢',
    title: 'Phát tin chiến dịch & Thông báo chính sách',
    desc: 'Lên lịch và gửi thông báo bảng giá mới, chương trình khuyến mãi tháng tới hàng trăm nhóm đại lý theo hàng đợi giãn cách chống khóa kênh.',
    bullets: ['Giãn cách an toàn 8–15 giây/nhóm', 'Cá nhân hóa lời chào theo từng đại lý', 'Công tắc dừng khẩn cấp trong 1 click'],
  },
];

const RETAIL_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN ĐƠN',
    title: 'Đại lý nhắn tin đặt hàng trong nhóm Zalo',
    desc: 'Đại lý gửi tin nhắn đặt hàng theo thói quen cũ mà không cần gõ đúng cú pháp cố định hay gắn thẻ bot.',
    example: '“Gửi cho chị 15 cái quạt Felix về kho Thái Nguyên, cước báo sau nhé”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'ĐỐI SOÁT QUY TẮC',
    title: 'Rules Engine tính giá & Kiểm tra công nợ',
    desc: 'Hệ thống ánh xạ mã SKU FLX-01, áp biểu giá đại lý Cấp 1 và đối soát hạn mức công nợ hợp lệ trong cơ sở dữ liệu.',
    example: 'Đơn giá: 1.150.000đ · Thành tiền: 17.250.000đ · Công nợ: Đủ điều kiện',
  },
  {
    step: 'BƯỚC 03',
    tag: 'PHÂN LUỒNG THỰC THI',
    title: 'Tự động gửi xác nhận hoặc chuyển Sales duyệt',
    desc: 'Đơn hàng trong ngưỡng an toàn tự động phát tin xác nhận vào nhóm Zalo; đơn vượt hạn mức chuyển Sales duyệt trước.',
    example: 'Đã phát tin xác nhận vào nhóm Zalo · Ghi nhận vào hàng việc nhân sự',
  },
  {
    step: 'BƯỚC 04',
    tag: 'XUẤT KHO VẬN HÀNH',
    title: 'Sales nhận việc và tạo đơn xuất hàng',
    desc: 'Thông tin đơn hàng được chuẩn hóa sẵn sàng để Sales sao chép/nhập vào phần mềm quản lý bán hàng.',
    example: 'Tạo hàng việc xuất kho · Lưu nhật ký kiểm toán đầy đủ',
  },
];

const RETAIL_FAQS = [
  {
    q: 'Đại lý trong nhóm Zalo có bắt buộc phải gõ đúng cú pháp cố định không?',
    a: 'Không cần. nexagnet được xây dựng để đại lý có thể nhắn tin hoàn toàn tự nhiên theo thói quen cũ (viết tắt, không dấu, gõ vội). Hệ thống tự động đọc hiểu và trích xuất mà không bắt buộc người mua phải học cú pháp mới.',
  },
  {
    q: 'Khi có bảng giá mới hoặc thay đổi chính sách chiết khấu, làm sao để cập nhật?',
    a: 'Nhân sự chỉ cần cập nhật trực tiếp qua Bảng điều khiển quản trị (Admin Panel) hoặc qua cơ sở dữ liệu. Hệ thống sẽ tự động áp dụng ngay lập tức mà không cần khởi động lại.',
  },
  {
    q: 'Đơn hàng sau khi AI xác nhận trên Zalo sẽ được đưa vào phần mềm quản trị như thế nào?',
    a: 'Trong giai đoạn 1, sau khi AI gửi xác nhận, hệ thống hiển thị đầy đủ thông tin chuẩn hóa trên Hàng việc để Sales nhập vào KiotViet, SAP hoặc Base. Ở giai đoạn sau, hệ thống cung cấp sẵn cổng ErpPort để tự động tạo đơn qua API.',
  },
];

export default function RetailDistributionIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Bán lẻ & Phân phối' }]}
          eyebrow="ỨNG DỤNG NGÀNH / RETAIL & DISTRIBUTION"
          badge="B2B & ĐẠI LÝ"
          title="AI cho Doanh nghiệp Bán lẻ & Phân phối (B2B)"
          subtitle="nexagnet có thể hỗ trợ các doanh nghiệp bán buôn và phân phối tự động hóa tiếp nhận đơn hàng Zalo, tra cứu bảng giá đại lý và kiểm soát hạn mức công nợ an toàn."
          primaryCtaText="Yêu cầu Demo Ngành Bán lẻ & Phân phối"
          supportingPill="Xử lý đơn hàng Zalo · Đối soát giá đại lý · Chống nghẽn đơn cao điểm"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NGÀNH PHÂN PHỐI"
          title="Những điểm nghẽn trong vận hành đại lý và kênh sỉ"
          subtitle="Quản lý hàng trăm nhóm chat trao đổi hàng ngày bằng phương pháp thủ công đang tạo ra áp lực khổng lồ cho đội ngũ bán hàng."
          challenges={RETAIL_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO NGÀNH PHÂN PHỐI"
          title="Tự động hóa chính xác, giải phóng sức lao động."
          subtitle="Giải quyết dứt điểm tình trạng đọc nhầm mã, gõ sai giá và chậm trễ phản hồi trong giờ cao điểm."
          features={RETAIL_FEATURES}
        />

        <WorkflowPreview
          eyebrow="LUỒNG XỬ LÝ ĐƠN HÀNG PHÂN PHỐI"
          title="Từ tin nhắn đại lý đến đơn hàng chuẩn xác."
          subtitle="Mọi đơn hàng đều được đối soát qua Nguồn sự thật trước khi phát tin xác nhận."
          steps={RETAIL_STEPS}
        />

        <ControlCallout
          title="Chính sách giá và hạn mức công nợ được bảo vệ tuyệt đối."
          desc="Rules Engine độc lập tính toán chính xác 100% theo cấp đối tác. Đơn hàng vượt hạn mức an toàn luôn chuyển giao cho Quản lý phê duyệt."
        />

        <RelatedModules
          title="Các sản phẩm nexagnet tiêu biểu"
          subtitle="Khám phá các phân hệ công nghệ được ứng dụng nhiều nhất trong ngành phân phối."
          items={[
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Sản phẩm tiêu biểu tự động hóa bóc tách và đối soát đơn hàng B2B.',
              href: '/products/order-automation',
              badge: 'Tiêu biểu',
            },
            {
              title: 'Giải pháp Bán hàng & Phân phối',
              desc: 'Hỗ trợ đội ngũ kinh doanh nâng cao tốc độ phản hồi và chốt giao dịch.',
              href: '/solutions/sales',
            },
            {
              title: 'Giải pháp Vận hành Doanh nghiệp',
              desc: 'Tự động hóa các quy trình phê duyệt và phân luồng nghiệp vụ theo quy tắc.',
              href: '/solutions/operations',
            },
          ]}
        />

        <FAQAccordion items={RETAIL_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
