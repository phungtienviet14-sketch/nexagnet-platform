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
  title: 'AI cho Phòng Nhân sự & Nội bộ (HR) | nexagnet',
  description:
    'Hỗ trợ quy trình nội bộ, tri thức nhân sự và yêu cầu nhân viên. Nexagnet giúp giải đáp cẩm nang quy chế tự động, tiếp nhận đề xuất nội bộ và chuyển duyệt an toàn.',
  keywords: [
    'AI cho phòng Nhân sự',
    'AI quản trị nội bộ',
    'Cẩm nang quy chế doanh nghiệp',
    'Tự động hóa tiếp nhận đề xuất nhân sự',
    'Phê duyệt nội bộ có kiểm soát',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments/hr',
  },
};

const HR_PAIN_POINTS = [
  {
    num: '01',
    title: 'Quy chế và chính sách nội bộ nằm rải rác',
    desc: 'Quy định nghỉ phép, chế độ công tác phí, phúc lợi và quy trình tạm ứng lưu trong nhiều file PDF, email cũ khiến nhân viên khó tra cứu.',
    consequence: 'Nhân viên liên tục nhắn tin hỏi đi hỏi lại bộ phận HR.',
  },
  {
    num: '02',
    title: 'HR mất nhiều thời gian trả lời câu hỏi lặp lại',
    desc: 'Hàng ngày HR phải giải đáp các câu hỏi cơ bản: "Còn mấy ngày phép?", "Biểu mẫu thanh toán ở đâu?", "Quy định thử việc thế nào?".',
    consequence: 'HR bị quá tải hành chính, thiếu thời gian cho đào tạo và phát triển nhân tài.',
  },
  {
    num: '03',
    title: 'Quy trình Onboarding nhân viên mới thủ công',
    desc: 'Mỗi khi có nhân sự mới, HR phải gửi tay hàng loạt tài liệu, hướng dẫn cài đặt phần mềm và giải thích quy chế từng bước.',
    consequence: 'Tốn nhiều thời gian và trải nghiệm nhân viên mới thiếu tính chuẩn hóa.',
  },
  {
    num: '04',
    title: 'Đề xuất nội bộ gửi qua chat dễ bị trôi',
    desc: 'Các yêu cầu xin nghỉ phép, đề xuất mua sắm trang thiết bị gửi qua tin nhắn chat cá nhân không có mã theo dõi và không biết ai đã duyệt.',
    consequence: 'Quy trình phê duyệt nội bộ bị chậm trễ và thiếu minh bạch.',
  },
];

const HR_CAPABILITIES = [
  {
    icon: '📖',
    title: 'Tra cứu cẩm nang quy chế & Chính sách 24/7',
    desc: 'AI hỗ trợ giải đáp tức thì các câu hỏi về nội quy lao động, chế độ phúc lợi và quy trình công ty dựa trên tài liệu đã ban hành.',
    bullets: ['Trích dẫn chính xác theo sổ tay nhân viên', 'Giải đáp nhanh chóng qua kênh chat nội bộ', 'Giảm 80% câu hỏi lặp lại cho HR'],
  },
  {
    icon: '📝',
    title: 'Tiếp nhận phiếu đề xuất & Đơn từ nội bộ',
    desc: 'Tự động thu thập thông tin xin nghỉ phép, đề xuất công tác hoặc cấp phát thiết bị và chuyển giao cho quản lý trực tiếp phê duyệt.',
    bullets: ['Chuẩn hóa thông tin đề xuất theo biểu mẫu', 'Kiểm tra điều kiện số ngày phép khả dụng', 'Tạo thẻ việc cho quản lý ký duyệt'],
  },
  {
    icon: '🎓',
    title: 'Hỗ trợ Onboarding & Hướng dẫn nhân sự mới',
    desc: 'Cung cấp trợ lý ảo đồng hành cùng nhân viên mới: Hướng dẫn văn hóa, quy trình làm việc, giới thiệu các phòng ban và tài liệu cần đọc.',
    bullets: ['Lộ trình làm quen chuẩn hóa theo từng vị trí', 'Giải đáp thắc mắc thường gặp của nhân sự mới', 'Nâng cao trải nghiệm gắn kết nhân viên'],
  },
  {
    icon: '🛡️',
    title: 'Quản trị phân quyền & Phê duyệt minh bạch',
    desc: 'Mọi phiếu đề xuất đều được chuyển đúng cấp quản lý có thẩm quyền và lưu vết thời gian phê duyệt rõ ràng.',
    bullets: ['Phân cấp phê duyệt theo sơ đồ tổ chức', 'Thông báo tức thì qua kênh trao đổi nội bộ', 'Lưu nhật ký kiểm toán phục vụ quản trị'],
  },
];

const HR_WORKFLOW = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN YÊU CẦU',
    role: 'ai' as const,
    title: 'Nhân viên gửi câu hỏi hoặc phiếu đề xuất',
    desc: 'Nhân viên nhắn tin qua kênh trao đổi nội bộ về quy chế hoặc gửi yêu cầu xin nghỉ phép.',
    example: '“Cho mình hỏi quy định xin nghỉ phép kết hôn được bao nhiêu ngày hưởng lương?”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'TRA CỨU QUY CHẾ',
    role: 'rules' as const,
    title: 'Đối chiếu sổ tay quy chế trong Source of Truth',
    desc: 'AI trích xuất quy định trong Thỏa ước lao động: Nghỉ kết hôn được nghỉ 03 ngày nguyên lương theo Luật Lao động.',
    example: 'Quy chế: Mục 4.2 Nghỉ việc riêng có lương · Số ngày: 03 ngày',
  },
  {
    step: 'BƯỚC 03',
    tag: 'HƯỚNG DẪN & TẠO ĐƠN',
    role: 'ai' as const,
    title: 'Phản hồi chi tiết & Thu thập thông tin tạo đơn',
    desc: 'AI giải đáp rõ ràng và hỗ trợ nhân viên điền ngày bắt đầu nghỉ để gửi quản lý trực tiếp duyệt.',
    example: '“Theo quy chế công ty, bạn được nghỉ 3 ngày nguyên lương. Bạn muốn tạo đơn nghỉ từ ngày nào ạ?”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'CHUYỂN QUẢN LÝ DUYỆT',
    role: 'human' as const,
    title: 'Chuyển phiếu đề xuất cho Trưởng phòng phê duyệt',
    desc: 'Hệ thống gửi thông báo kèm nút duyệt nhanh tới Trưởng bộ phận phụ trách và lưu vào hồ sơ nhân sự.',
    example: 'Đã tạo phiếu: Đơn xin nghỉ phép kết hôn · Chờ Trưởng phòng duyệt · Lưu hồ sơ HR',
  },
];

const HR_FAQS = [
  {
    q: 'Hệ thống có tự động duyệt đơn nghỉ phép của nhân viên không?',
    a: 'Không. Hệ thống chỉ hỗ trợ giải đáp quy chế, kiểm tra số ngày phép còn lại và chuẩn hóa phiếu đề xuất. Quyết định phê duyệt đơn từ luôn do Trưởng bộ phận trực tiếp hoặc Quản lý nhân sự xác nhận.',
  },
  {
    q: 'Khi có chính sách nhân sự mới, làm sao để cập nhật vào hệ thống?',
    a: 'HR chỉ cần tải văn bản quy chế mới lên Bảng điều khiển quản trị Tri thức (Knowledge Engine). Hệ thống sẽ tự động cập nhật và áp dụng cho các câu trả lời tiếp theo.',
  },
];

export default function HRDepartmentPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <DepartmentHero
          breadcrumbs={[{ label: 'Phòng ban', href: '/departments' }, { label: 'Nhân sự & Nội bộ (HR)' }]}
          eyebrow="ỨNG DỤNG PHÒNG BAN / HUMAN RESOURCES & INTERNAL"
          badge="QUY TRÌNH NỘI BỘ & TRI THỨC NHÂN SỰ"
          title="Hỗ trợ quy trình nội bộ, tri thức nhân sự và yêu cầu nhân viên."
          subtitle="Hỗ trợ giải đáp cẩm nang quy chế tự động 24/7, chuẩn hóa quy trình onboarding và tiếp nhận phiếu đề xuất nội bộ có kiểm soát phê duyệt của quản lý."
          primaryCtaText="Trao đổi về giải pháp Nhân sự"
          supportingPill="Cẩm nang quy chế 24/7 · Tiếp nhận đề xuất chuẩn · Phê duyệt phân cấp"
        />

        <DepartmentPainPoints
          eyebrow="ĐIỂM NGHẼN PHÒNG NHÂN SỰ"
          title="Tại sao bộ phận HR thường bị quá tải bởi các tác vụ hành chính?"
          subtitle="Khi thiếu một điểm tra cứu tập trung, HR phải dành phần lớn thời gian giải đáp các câu hỏi quy chế lặp đi lặp lại thay vì tập trung phát triển con người."
          points={HR_PAIN_POINTS}
        />

        <DepartmentCapabilities
          eyebrow="NĂNG LỰC HỖ TRỢ NHÂN SỰ"
          title="Tự động hóa tác vụ lặp lại, nâng cao trải nghiệm nội bộ."
          subtitle="Hỗ trợ nhân viên tra cứu quy chế tức thời và gửi đề xuất dễ dàng qua các kênh trao đổi quen thuộc."
          capabilities={HR_CAPABILITIES}
          columns={2}
        />

        <DepartmentWorkflow
          eyebrow="LUỒNG TRA CỨU & ĐỀ XUẤT NỘI BỘ"
          title="Từ câu hỏi của nhân viên đến phiếu đề xuất được phê duyệt."
          subtitle="Quy trình thông suốt giúp giải đáp nhanh chóng và chuyển giao phê duyệt tới đúng người có thẩm quyền."
          steps={HR_WORKFLOW}
          governanceNote="Thông tin cá nhân và chế độ lương thưởng của nhân viên được bảo mật tuyệt đối, chỉ những nhân sự có thẩm quyền mới được phân quyền xem."
        />

        <RelatedModules
          title="Các sản phẩm Nexagnet liên quan"
          subtitle="Khám phá các module công nghệ hỗ trợ quản trị tri thức nội bộ."
          items={[
            {
              title: 'Tri thức Doanh nghiệp (Knowledge)',
              desc: 'Hợp nhất toàn bộ sổ tay nhân viên, cẩm nang quy chế và biểu mẫu.',
              href: '/products/knowledge',
              badge: 'Tiêu biểu',
            },
            {
              title: 'Phòng Vận hành (Operations)',
              desc: 'Luân chuyển các phiếu đề xuất mua sắm trang thiết bị nội bộ.',
              href: '/departments/operations',
            },
            {
              title: 'Ban Giám đốc (Executive)',
              desc: 'Góc nhìn điều hành và phê duyệt các chính sách nhân sự cấp cao.',
              href: '/departments/executive',
            },
          ]}
        />

        <RelatedDepartments
          title="Khám phá các phòng ban liên quan"
          subtitle="Xem cách phòng Nhân sự kết nối với Ban Giám đốc và các phòng ban khác."
          currentDeptSlug="hr"
        />

        <FAQAccordion items={HR_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
