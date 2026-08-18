import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { DepartmentHero } from '@/components/departments/DepartmentHero';
import { FinanceHeroVisual } from '@/components/departments/DepartmentHeroVisuals';
import { DepartmentPainPoints } from '@/components/departments/DepartmentPainPoints';
import { DepartmentCapabilities } from '@/components/departments/DepartmentCapabilities';
import { DepartmentWorkflow } from '@/components/departments/DepartmentWorkflow';
import { RelatedDepartments } from '@/components/departments/RelatedDepartments';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'AI Hỗ trợ Phòng Tài chính & Kế toán (Finance) | nexagnet',
  description:
    'Thu thập, chuẩn hóa và đối chiếu dữ liệu trước khi con người ra quyết định. Nexagnet hỗ trợ bộ phận Tài chính - Kế toán kiểm tra chứng từ, phát hiện thiếu thông tin và chuyển duyệt an toàn.',
  keywords: [
    'AI cho phòng Tài chính Kế toán',
    'Chuẩn hóa dữ liệu tài chính',
    'Đối soát chứng từ hóa đơn',
    'Kiểm soát hạn mức công nợ',
    'Phê duyệt tài chính có kiểm soát',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments/finance',
  },
};

const FINANCE_PAIN_POINTS = [
  {
    num: '01',
    title: 'Dữ liệu giao dịch từ Sales gửi sang thiếu sót, gõ vội',
    desc: 'Đơn hàng từ các kênh chat gửi sang kế toán thường thiếu thông tin mã số thuế, địa chỉ xuất hóa đơn hoặc ghi chú thanh toán không rõ ràng.',
    consequence: 'Kế toán mất nhiều thời gian gọi điện hỏi lại từng nhân viên.',
  },
  {
    num: '02',
    title: 'Áp lực đối soát số liệu và kiểm tra công nợ cuối tháng',
    desc: 'Hàng trăm giao dịch mua bán, thanh toán tạm ứng và công nợ đại lý phải đối soát thủ công qua nhiều file bảng tính riêng lẻ.',
    consequence: 'Dễ xảy ra nhầm lẫn số liệu và chậm trễ chốt sổ sách kế toán.',
  },
  {
    num: '03',
    title: 'Chứng từ thanh toán chuyển khoản gửi qua chat phân tán',
    desc: 'Ảnh chụp ủy nhiệm chi, biên lai chuyển tiền nằm rải rác trong nhiều nhóm chat Zalo của từng nhân viên kinh doanh.',
    consequence: 'Khó gom đủ chứng từ gốc khi cần kiểm tra hoặc thanh tra thuế.',
  },
  {
    num: '04',
    title: 'Nguy cơ xuất hàng khi đại lý đã vượt hạn mức nợ',
    desc: 'Khi không có công cụ đối soát tự động theo thời gian thực, đơn hàng của đại lý có nợ quá hạn vẫn có thể bị xuất kho.',
    consequence: 'Rủi ro phát sinh nợ xấu khó đòi cho doanh nghiệp.',
  },
];

const FINANCE_CAPABILITIES = [
  {
    icon: 'metrics',
    title: 'Thu thập & Chuẩn hóa dữ liệu giao dịch',
    desc: 'Tự động trích xuất đầy đủ thông tin: Mã khách hàng, mã SKU, số lượng, đơn giá, thuế VAT và thông tin xuất hóa đơn từ tin nhắn hội thoại.',
    bullets: ['Chuẩn hóa dữ liệu đầu vào theo cấu trúc chuẩn', 'Tự động tính thuế VAT và tổng tiền tất định', 'Phát hiện ngay các đơn hàng thiếu thông tin xuất VAT'],
  },
  {
    icon: 'finance',
    title: 'Đối chiếu chính sách thanh toán & Công nợ',
    desc: 'Hệ thống đối soát tự động điều khoản thanh toán (công nợ 30/45 ngày, ký gửi, thanh toán ngay, COD) theo từng hồ sơ đối tác trong cơ sở dữ liệu.',
    bullets: ['Kiểm tra hạn mức nợ khả dụng trước khi xuất hàng', 'Cảnh báo khi đối tác có hóa đơn quá hạn', 'Tuyệt đối không để AI tự quyết định thay đổi hạn mức'],
  },
  {
    icon: 'ledger',
    title: 'Gom chứng từ & Chuẩn bị bảng kê cho Kế toán',
    desc: 'Tự động gom ảnh chụp ủy nhiệm chi, hóa đơn và biên lai giao nhận theo từng mã đơn hàng để kế toán dễ dàng đối soát.',
    bullets: ['Tập trung toàn bộ chứng từ vào một hồ sơ duy nhất', 'Hỗ trợ kế toán sao chép/nhập dữ liệu vào phần mềm', 'Tiết kiệm 70% thời gian tìm kiếm chứng từ'],
  },
  {
    icon: 'governance',
    title: 'Cổng phê duyệt ngoại lệ tài chính có kiểm soát',
    desc: 'Mọi đề xuất chiết khấu đặc biệt hoặc gia hạn nợ bắt buộc phải qua cổng phê duyệt của Kế toán trưởng hoặc Giám đốc tài chính.',
    bullets: ['Quyền quyết định tài chính 100% thuộc về con người', 'Minh bạch căn cứ và người ký duyệt', 'Lưu nhật ký kiểm toán phục vụ thanh tra nội bộ'],
  },
];

const FINANCE_WORKFLOW = [
  {
    step: 'BƯỚC 01',
    tag: 'THU THẬP DỮ LIỆU',
    role: 'ai' as const,
    title: 'Thu nhận thông tin đơn hàng & Chứng từ',
    desc: 'AI tiếp nhận tin nhắn đặt hàng, bóc tách thực thể và gom ảnh chứng từ chuyển tiền từ kênh giao tiếp.',
    example: 'Đơn hàng: #DH-1052 · Tổng tiền: 45.000.000đ · Kèm ảnh UNC ngân hàng',
  },
  {
    step: 'BƯỚC 02',
    tag: 'ĐỐI SOÁT TẤT ĐỊNH',
    role: 'rules' as const,
    title: 'Rules Engine tính toán & Đối soát công nợ',
    desc: 'Hệ thống tính thuế VAT tất định, đối chiếu hạn mức nợ của đối tác trong cơ sở dữ liệu (Source of Truth).',
    example: 'Tiền hàng: 40.909k · Thuế VAT 10%: 4.091k · Hạn mức nợ hiện tại: Đạt tiêu chuẩn',
  },
  {
    step: 'BƯỚC 03',
    tag: 'CỔNG DUYỆT NHÂN SỰ',
    role: 'human' as const,
    title: 'Kế toán kiểm tra chứng từ & Phê duyệt ghi nhận',
    desc: 'Kế toán viên kiểm tra tiền về tài khoản, xác nhận chứng từ hợp lệ trên giao diện Hàng việc.',
    example: 'Kế toán xác nhận: Đã nhận chuyển khoản đủ · Ký duyệt xuất hóa đơn điện tử',
  },
  {
    step: 'BƯỚC 04',
    tag: 'LƯU VẾT KIỂM TOÁN',
    role: 'system' as const,
    title: 'Ghi nhật ký kiểm toán & Chuyển luồng vận hành',
    desc: 'Hệ thống lưu vết toàn bộ hồ sơ giao dịch và thông báo cho bộ phận Kho tiến hành xuất hàng.',
    example: 'Đã lưu Audit Log giao dịch · Chuyển lệnh xuất kho hợp lệ',
  },
];

const FINANCE_FAQS = [
  {
    q: 'Hệ thống AI có tự động duyệt chi hoặc tự động chuyển tiền ngân hàng không?',
    a: 'Tuyệt đối không. Nexagnet tuân thủ nghiêm ngặt nguyên tắc quản trị rủi ro tài chính: AI chỉ hỗ trợ thu thập, chuẩn hóa, đối chiếu dữ liệu và phát hiện thiếu sót. Toàn bộ quyền quyết định tài chính, duyệt chi, thay đổi hạn mức nợ hay xuất hóa đơn chính thức 100% do con người kiểm tra và thực hiện.',
  },
  {
    q: 'Làm thế nào để cập nhật chính sách công nợ hoặc biểu thuế VAT mới?',
    a: 'Quản trị viên hoặc Kế toán trưởng có thể cập nhật trực tiếp chính sách trên Bảng điều khiển quản trị (Admin Panel). Rules Engine sẽ ngay lập tức áp dụng biểu quy tắc mới một cách chính xác mà không có sai số.',
  },
];

export default function FinanceDepartmentPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <DepartmentHero
          breadcrumbs={[{ label: 'Phòng ban', href: '/departments' }, { label: 'Tài chính & Kế toán (Finance)' }]}
          eyebrow="ỨNG DỤNG PHÒNG BAN / FINANCE & ACCOUNTING"
          badge="KIỂM SOÁT & ĐỐI SOÁT DỮ LIỆU"
          title="Thu thập, chuẩn hóa và đối chiếu dữ liệu trước khi con người quyết định."
          subtitle="Hỗ trợ bộ phận Tài chính - Kế toán chuẩn hóa số liệu đơn hàng, kiểm tra hạn mức công nợ tự động và gom chứng từ đầy đủ để nhân sự phê duyệt an toàn."
          primaryCtaText="Trao đổi về giải pháp Tài chính"
          supportingPill="Chuẩn hóa dữ liệu · Đối soát công nợ tất định · Quyền quyết định thuộc về con người"
          visual={<FinanceHeroVisual />}
        />

        <DepartmentPainPoints
          eyebrow="ĐIỂM NGHẼN PHÒNG TÀI CHÍNH - KẾ TOÁN"
          title="Tại sao việc đối soát dữ liệu thường gây áp lực lớn cho Kế toán?"
          subtitle="Khi đơn hàng và chứng từ gửi về qua nhiều kênh chat không có cấu trúc chuẩn, kế toán phải tốn hàng giờ kiểm tra thủ công từng con số."
          points={FINANCE_PAIN_POINTS}
        />

        <DepartmentCapabilities
          eyebrow="NĂNG LỰC HỖ TRỢ TÀI CHÍNH"
          title="Chuẩn hóa số liệu, kiểm soát hạn mức nợ an toàn."
          subtitle="Tách bạch hoàn toàn giữa việc thu thập dữ liệu tự động và quyền ra quyết định tài chính của con người."
          capabilities={FINANCE_CAPABILITIES}
          columns={2}
        />

        <DepartmentWorkflow
          eyebrow="LUỒNG ĐỐI SOÁT & PHÊ DUYỆT TÀI CHÍNH"
          title="Từ chứng từ giao dịch đến quyết định phê duyệt chuẩn xác."
          subtitle="Mọi phép tính tiền đều do Rules Engine thực thi tất định, loại bỏ 100% rủi ro ảo giác số liệu."
          steps={FINANCE_WORKFLOW}
          governanceNote="Hệ thống không tự động ghi sổ kế toán hay tự duyệt thanh toán. Toàn bộ thao tác đều được chuẩn bị sẵn sàng để Kế toán viên kiểm tra và xác nhận."
        />

        <RelatedModules
          title="Các sản phẩm Nexagnet liên quan"
          subtitle="Khám phá các module công nghệ hỗ trợ kiểm soát dữ liệu tài chính."
          items={[
            {
              title: 'Kiểm soát & Quản trị AI',
              desc: 'Hệ thống Rules Engine tính toán biểu giá, thuế VAT và công nợ tất định.',
              href: '/platform/control',
              badge: 'Trọng tâm',
            },
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Tự động hóa bóc tách đơn hàng và đối soát chính sách thanh toán B2B.',
              href: '/products/order-automation',
            },
            {
              title: 'Phòng Vận hành (Operations)',
              desc: 'Đồng bộ dữ liệu xuất kho với chứng từ thanh toán của kế toán.',
              href: '/departments/operations',
            },
          ]}
        />

        <RelatedDepartments
          title="Khám phá các phòng ban liên quan"
          subtitle="Xem cách phòng Tài chính kết nối với Sales, Vận hành và Ban Giám đốc."
          currentDeptSlug="finance"
        />

        <FAQAccordion items={FINANCE_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
