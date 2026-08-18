import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ResourceHero } from '@/components/resources/ResourceHero';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Câu hỏi Thường gặp (FAQ) | nexagnet',
  description:
    'Tổng hợp các câu hỏi thường gặp về định vị nền tảng, triển khai thực tế, an toàn bảo mật và chi phí vận hành nexagnet.',
  alternates: {
    canonical: 'https://nexagnet247.com/resources/faq',
  },
};

const GENERAL_FAQS = [
  {
    q: 'nexagnet là gì và khác gì so với các Chatbot AI thông thường?',
    a: 'nexagnet là Nền tảng AI cho Doanh nghiệp (Enterprise AI Platform), không phải một chatbot trò chuyện thông thường. Điểm khác biệt cốt lõi là nexagnet tích hợp Rules Engine tất định độc lập: AI chỉ làm nhiệm vụ đọc hiểu ngôn ngữ và trích xuất thông tin, còn toàn bộ việc tính toán tiền, thuế VAT, chiết khấu và đối soát công nợ đều do mã nguồn tất định thực thi từ cơ sở dữ liệu (Nguồn sự thật). Nhờ đó, loại bỏ hoàn toàn hiện tượng AI bịa đặt giá hay quyết định sai chính sách.',
  },
  {
    q: 'Doanh nghiệp nên bắt đầu triển khai từ đâu?',
    a: 'Doanh nghiệp nên bắt đầu từ một bài toán vận hành cụ thể và bức thiết nhất — ví dụ: Tự động hóa tiếp nhận đơn hàng đại lý qua Zalo (Order Automation) hoặc Trợ lý tra cứu chính sách bảo hành (Knowledge Base). Sau khi quy trình đầu tiên hoạt động ổn định và đo lường được hiệu quả, doanh nghiệp có thể mở rộng sang các module tiếp theo.',
  },
  {
    q: 'Có cần phải đập đi toàn bộ hệ thống hoặc phần mềm quản trị hiện tại không?',
    a: 'Hoàn toàn không. nexagnet được xây dựng theo nguyên tắc bổ trợ và kết nối mở. Hệ thống tiếp nhận thông tin từ các kênh chat quen thuộc (Zalo, Messenger, Web) và tạo Hàng việc để nhân viên nhập liệu vào phần mềm quản lý (KiotViet, SAP, Bravo, Base). Khi doanh nghiệp muốn kết nối tự động hoàn toàn, nexagnet cung cấp sẵn cổng API ErpPort để tích hợp.',
  },
  {
    q: 'Hệ thống có hỗ trợ triển khai thử nghiệm từng bước (Phased Rollout) không?',
    a: 'Có. nexagnet tuân thủ lộ trình 4 giai đoạn chuẩn: (1) Khảo sát & Nạp nguồn sự thật → (2) Kết nối nhóm Zalo & Kênh tiếp nhận → (3) Chạy thử nghiệm có kiểm duyệt 100% (Sales duyệt mọi đơn) → (4) Kích hoạt tự động hóa theo ngưỡng an toàn (ví dụ: đơn ≤ 50 sản phẩm tự gửi, đơn lớn chuyển Sales).',
  },
  {
    q: 'Dữ liệu kinh doanh và khách hàng của chúng tôi được bảo vệ như thế nào?',
    a: 'nexagnet tuân thủ nghiêm ngặt Luật Bảo vệ Dữ liệu cá nhân (91/2025/QH15) và Nghị định 356/2025. Dữ liệu khách hàng, số điện thoại, địa chỉ và đơn hàng là tài sản nội bộ của doanh nghiệp — chỉ lưu trữ trên hạ tầng bảo mật của bạn và tuyệt đối không chia sẻ cho bên thứ ba ngoài các API đã ký thỏa thuận xử lý dữ liệu.',
  },
  {
    q: 'Ai có bao giờ tự ý ra quyết định phát tin ngoài tầm kiểm soát không?',
    a: 'Không bao giờ. nexagnet thiết lập 3 tầng chốt chặn: (1) Rules Engine tính toán theo Nguồn sự thật; (2) Ngưỡng tự động hóa rõ ràng — các đơn vượt hạn mức hoặc thiếu thông tin đều chuyển nhân sự duyệt; (3) Công tắc ngắt khẩn cấp (Kill-switch) cho phép quản trị viên tạm dừng gửi tin tức thì trong 1 click.',
  },
  {
    q: 'Đại lý trong nhóm Zalo có bắt buộc phải gõ theo mẫu cứng nhắc không?',
    a: 'Không. Đại lý có thể nhắn tin hoàn toàn tự nhiên (viết tắt, không dấu, dùng từ lóng như "TN" = Thái Nguyên, "Felix" = FLX-01). AI của nexagnet được cấu hình theo từ điển đóng (closed glossary) của doanh nghiệp để đọc hiểu chính xác mà không bắt người mua phải học cú pháp mới.',
  },
];

export default function ResourcesFAQPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <ResourceHero
          breadcrumbs={[{ label: 'Tài nguyên', href: '/#resources' }, { label: 'Câu hỏi Thường gặp' }]}
          eyebrow="TÀI NGUYÊN / FREQUENTLY ASKED QUESTIONS"
          badge="HỎI ĐÁP TOÀN DIỆN"
          title="Câu hỏi thường gặp về Nền tảng nexagnet"
          subtitle="Tổng hợp những điều doanh nghiệp quan tâm nhất về định vị nền tảng, cơ chế kiểm soát, phương thức triển khai và an toàn dữ liệu."
          primaryCtaText="Đặt câu hỏi trực tiếp"
          supportingPill="Minh bạch năng lực · Kiểm soát an toàn · Giải đáp 100% thắc mắc"
        />

        <FAQAccordion
          eyebrow="TỔNG HỢP GIẢI ĐÁP"
          title="Mọi điều bạn cần biết trước khi triển khai."
          subtitle="Những câu trả lời trung thực và chuẩn xác về khả năng vận hành của nexagnet."
          items={GENERAL_FAQS}
        />

        <ControlCallout
          title="Bạn vẫn còn câu hỏi chưa được giải đáp?"
          desc="Hãy liên hệ trực tiếp với đội ngũ chuyên gia nexagnet để được phân tích chi tiết theo đúng bài toán và mô hình vận hành của công ty bạn."
          primaryLinkHref="#demo"
          primaryLinkText="Đăng ký Trao đổi & Nhận Demo 1-1"
        />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
