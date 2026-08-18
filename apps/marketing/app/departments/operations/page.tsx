import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { DepartmentHero } from '@/components/departments/DepartmentHero';
import { OperationsHeroVisual } from '@/components/departments/DepartmentHeroVisuals';
import { DepartmentPainPoints } from '@/components/departments/DepartmentPainPoints';
import { DepartmentCapabilities } from '@/components/departments/DepartmentCapabilities';
import { DepartmentWorkflow } from '@/components/departments/DepartmentWorkflow';
import { RelatedDepartments } from '@/components/departments/RelatedDepartments';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'AI cho Phòng Vận hành (Operations) | nexagnet',
  description:
    'Biến các quy trình vận hành thành workflow có thể theo dõi. Nexagnet hỗ trợ tự động luân chuyển công việc, kiểm tra điều kiện quy tắc và quản lý ngoại lệ có kiểm soát.',
  keywords: [
    'AI cho phòng Vận hành',
    'Tự động hóa quy trình vận hành',
    'Quản trị luồng công việc doanh nghiệp',
    'Workflow Orchestration',
    'Giám sát hàng việc liên phòng ban',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments/operations',
  },
};

const OPERATIONS_PAIN_POINTS = [
  {
    num: '01',
    title: 'Giao việc qua chat, thiếu trạng thái theo dõi',
    desc: 'Các yêu cầu xuất kho, xử lý đơn gấp hoặc kiểm tra hàng tồn được nhắn qua chat nhóm nội bộ, không có mã phiếu và không biết ai đang xử lý.',
    consequence: 'Công việc bị trôi, dễ xảy ra tình trạng đùn đẩy trách nhiệm.',
  },
  {
    num: '02',
    title: 'Kiểm tra điều kiện xuất hàng bằng tay tốn thời gian',
    desc: 'Nhân viên vận hành phải đối chiếu thủ công từng đơn: Đã duyệt giá chưa? Đã đủ điều kiện công nợ chưa? Có ghi chú giao hàng đặc biệt không?',
    consequence: 'Tốc độ xử lý đơn hàng bị chậm lại, dễ xuất nhầm đơn chưa đủ điều kiện.',
  },
  {
    num: '03',
    title: 'Chuyển giao công việc giữa các bộ phận thủ công',
    desc: 'Từ lúc Sales chốt đơn đến khi Kho đóng gói, Giao vận nhận hàng và Kế toán xuất hóa đơn phải qua nhiều bước nhắn tin và gửi file qua lại.',
    consequence: 'Thông tin bị nghẽn ở các khâu trung gian.',
  },
  {
    num: '04',
    title: 'Ngoại lệ và sự cố không có người chịu trách nhiệm rõ ràng',
    desc: 'Khi hàng bị thiếu số lượng, giao trễ hoặc địa chỉ nhận sai, không có quy trình gom hồ sơ và gán người giải quyết dứt điểm.',
    consequence: 'Sự cố kéo dài, gây thất thoát thời gian và chi phí.',
  },
  {
    num: '05',
    title: 'Người quản lý phải liên tục đuổi theo tiến độ',
    desc: 'Trưởng phòng vận hành phải liên tục họp giao ban hoặc gọi điện hỏi từng ca trực để biết hôm nay còn bao nhiêu đơn chưa xuất.',
    consequence: 'Mất thời gian quản lý vi mô thay vì tối ưu hóa chuỗi cung ứng.',
  },
];

const OPERATIONS_CAPABILITIES = [
  {
    icon: 'routing',
    title: 'Luân chuyển công việc tự động theo luồng chuẩn',
    desc: 'Tự động tạo phiếu việc và chuyển giao nhiệm vụ tới đúng phòng ban (Kho, Giao vận, Kế toán) ngay khi đơn hàng được xác nhận.',
    bullets: ['Loại bỏ thao tác nhắn tin giao việc thủ công', 'Gán việc theo chuyên môn và khu vực', 'Gắn mã định danh và thời hạn xử lý (SLA)'],
  },
  {
    icon: 'rules',
    title: 'Kiểm tra điều kiện quy tắc tự động',
    desc: 'Rules Engine tự động kiểm tra tính hợp lệ của đơn hàng: Đủ hàng tồn kho, đúng bảng giá, hợp lệ công nợ trước khi kích hoạt lệnh xuất kho.',
    bullets: ['Đối soát chính sách tự động 100%', 'Cảnh báo tức thời nếu phát hiện điều kiện chưa đạt', 'Bảo vệ an toàn quy tắc vận hành doanh nghiệp'],
  },
  {
    icon: 'audit',
    title: 'Hàng việc tập trung & Quản trị ngoại lệ',
    desc: 'Cung cấp một màn hình Hàng việc thống nhất, hiển thị rõ việc nào AI đã xử lý, việc nào cần con người thực hiện và việc nào đang bị nghẽn.',
    bullets: ['Minh bạch trạng thái từng quy trình', 'Gom hồ sơ ngoại lệ để xử lý nhanh', 'Lưu nhật ký kiểm toán phục vụ đối chiếu'],
  },
  {
    icon: 'metrics',
    title: 'Giám sát tiến độ & Cảnh báo tắc nghẽn',
    desc: 'Người quản lý có cái nhìn toàn cảnh về tình hình xử lý công việc trong ngày, nhận cảnh báo sớm khi có đơn hàng bị trễ hạn.',
    bullets: ['Theo dõi năng suất theo thời gian thực', 'Phát hiện nút thắt cổ chai trong chuỗi quy trình', 'Báo cáo tổng kết vận hành định kỳ'],
  },
];

const OPERATIONS_WORKFLOW = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN YÊU CẦU',
    role: 'ai' as const,
    title: 'Tiếp nhận đơn hàng hoặc yêu cầu vận hành',
    desc: 'Hệ thống nhận thông tin từ các kênh tiếp nhận sau khi AI đọc hiểu và chuẩn hóa dữ liệu.',
    example: 'Yêu cầu: Xuất 40 quạt đứng Felix về Chi nhánh Hải Phòng · Người nhận: Anh Hùng',
  },
  {
    step: 'BƯỚC 02',
    tag: 'ĐỐI SOÁT ĐIỀU KIỆN',
    role: 'rules' as const,
    title: 'Rules Engine kiểm tra điều kiện xuất hàng',
    desc: 'Hệ thống kiểm tra tồn kho chi nhánh, đối soát biểu giá và hạn mức công nợ đối tác.',
    example: 'Tồn kho khả dụng: 120 chiếc · Biểu giá C1: Hợp lệ · Công nợ: Trong hạn mức an toàn',
  },
  {
    step: 'BƯỚC 03',
    tag: 'PHÂN BỔ TÁC VỤ',
    role: 'system' as const,
    title: 'Tự động tạo thẻ việc cho Đội Kho & Giao vận',
    desc: 'Hệ thống gán nhiệm vụ xuất kho cho ca trực Kho Hải Phòng và tạo yêu cầu điều phối vận chuyển.',
    example: 'Đã tạo thẻ việc: Đóng gói đơn hàng #DH-1049 · Bộ phận: Kho Hải Phòng',
  },
  {
    step: 'BƯỚC 04',
    tag: 'THỰC THI & HOÀN TẤT',
    role: 'human' as const,
    title: 'Nhân sự thực hiện & Cập nhật trạng thái hoàn thành',
    desc: 'Nhân viên kho hoàn tất đóng gói, quét mã vận đơn và bấm hoàn tất trên giao diện Hàng việc.',
    example: 'Đã xuất kho lúc 15:45 · Mã vận đơn: VTP-884920 · Lưu nhật ký kiểm toán',
  },
];

const OPERATIONS_FAQS = [
  {
    q: 'Nexagnet có phải là một phần mềm WMS hoặc ERP quản lý kho không?',
    a: 'Không. Nexagnet không thay thế phần mềm ERP hay WMS của doanh nghiệp. Nexagnet đóng vai trò là Lớp AI Điều phối vận hành (Operations Layer) giúp tự động tiếp nhận thông tin từ các kênh trao đổi, kiểm tra quy tắc và phân luồng tác vụ cho nhân sự thao tác trên phần mềm quản trị nhanh chóng và chính xác hơn.',
  },
  {
    q: 'Khi đơn hàng gặp ngoại lệ (ví dụ: kho hết hàng) thì hệ thống xử lý ra sao?',
    a: 'Hệ thống lập tức gắn nhãn ngoại lệ "Thiếu hàng tồn kho", ngừng luồng xuất hàng tự động và chuyển phiếu yêu cầu vào Hàng đợi Cần Chú Ý của Quản lý Vận hành để điều chuyển kho hoặc thông báo lại cho Sales.',
  },
];

export default function OperationsDepartmentPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <DepartmentHero
          breadcrumbs={[{ label: 'Phòng ban', href: '/departments' }, { label: 'Phòng Vận hành (Operations)' }]}
          eyebrow="ỨNG DỤNG PHÒNG BAN / OPERATIONS & WORKFLOW"
          badge="ĐIỀU PHỐI QUY TRÌNH & KHO VẬN"
          title="Biến các quy trình vận hành thành workflow có thể theo dõi."
          subtitle="Tự động luân chuyển tác vụ, kiểm tra điều kiện xuất hàng, quản lý ngoại lệ và đưa dữ liệu về một hàng việc thống nhất cho toàn bộ đội ngũ."
          primaryCtaText="Trao đổi về giải pháp Vận hành"
          supportingPill="Luân chuyển tác vụ tự động · Kiểm tra điều kiện tất định · Hàng việc minh bạch"
          visual={<OperationsHeroVisual />}
        />

        <DepartmentPainPoints
          eyebrow="ĐIỂM NGHẼN PHÒNG VẬN HÀNH"
          title="Tại sao việc phối hợp giữa Kho, Sales và Giao vận thường xuyên bị nghẽn?"
          subtitle="Khi không có một lớp trạng thái chung, các phòng ban sẽ mất nhiều thời gian kiểm tra chéo và dễ phát sinh sai sót khi giao nhận hàng."
          points={OPERATIONS_PAIN_POINTS}
        />

        <DepartmentCapabilities
          eyebrow="NĂNG LỰC HỖ TRỢ VẬN HÀNH"
          title="Thông suốt quy trình, giảm thiểu sai sót."
          subtitle="Kết hợp logic kiểm tra quy tắc tất định với hàng việc giao nhiệm vụ minh bạch cho từng nhân sự."
          capabilities={OPERATIONS_CAPABILITIES}
          columns={2}
        />

        <DepartmentWorkflow
          eyebrow="LUỒNG QUY TRÌNH VẬN HÀNH"
          title="Từ đơn hàng được xác nhận đến kiện hàng xuất kho."
          subtitle="Mọi bước luân chuyển đều được kiểm tra điều kiện và lưu vết đầy đủ trong nhật ký kiểm toán."
          steps={OPERATIONS_WORKFLOW}
          governanceNote="Lệnh xuất kho chỉ được kích hoạt khi đơn hàng thỏa mãn 100% các điều kiện về tồn kho, bảng giá và hạn mức công nợ."
        />

        <RelatedModules
          title="Các sản phẩm Nexagnet liên quan"
          subtitle="Khám phá các module công nghệ hỗ trợ tối ưu hóa vận hành."
          items={[
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Tự động hóa luồng bóc tách đơn hàng và chuyển sang vận hành.',
              href: '/products/order-automation',
              badge: 'Tiêu biểu',
            },
            {
              title: 'Phòng Bán hàng (Sales)',
              desc: 'Kết nối trực tiếp giữa đơn hàng của Sales và đội ngũ kho xuất hàng.',
              href: '/departments/sales',
            },
            {
              title: 'Kiểm soát & Quản trị AI',
              desc: 'Hệ thống Rules Engine kiểm tra điều kiện quy tắc tất định.',
              href: '/platform/control',
            },
          ]}
        />

        <RelatedDepartments
          title="Khám phá các phòng ban liên quan"
          subtitle="Xem cách phòng Vận hành kết nối với Sales, Tài chính và Ban Giám đốc."
          currentDeptSlug="operations"
        />

        <FAQAccordion items={OPERATIONS_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
