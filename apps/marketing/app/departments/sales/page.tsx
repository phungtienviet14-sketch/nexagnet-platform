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
  title: 'AI Hỗ trợ Phòng Bán hàng (Sales) | nexagnet',
  description:
    'Giảm thao tác lặp lại từ tiếp nhận lead, tra cứu bảng giá đại lý đến xử lý yêu cầu đặt hàng. Nexagnet đồng hành cùng đội ngũ Sales nâng cao tốc độ phản hồi và chốt giao dịch.',
  keywords: [
    'AI cho phòng Sales',
    'AI bán hàng B2B',
    'Tự động hóa báo giá đại lý',
    'Bóc tách đơn hàng Zalo',
    'Hỗ trợ đội ngũ kinh doanh',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments/sales',
  },
};

const SALES_PAIN_POINTS = [
  {
    num: '01',
    title: 'Lead phân tán từ nhiều kênh khác nhau',
    desc: 'Yêu cầu của khách hàng đổ về từ Zalo cá nhân, Fanpage, Website và nhóm chat đối tác khiến nhân viên Sales dễ bỏ sót cơ hội.',
    consequence: 'Khách hàng phải chờ đợi lâu và dễ chuyển sang đối thủ.',
  },
  {
    num: '02',
    title: 'Mất nhiều thời gian tra cứu bảng giá và tồn kho',
    desc: 'Mỗi khi đại lý hỏi giá hoặc chính sách chiết khấu, nhân viên phải mở nhiều file Excel bảng giá, kiểm tra số lượng tồn kho từng chi nhánh.',
    consequence: 'Mất 3–5 phút cho mỗi câu trả lời đơn giản, dễ báo nhầm giá.',
  },
  {
    num: '03',
    title: 'Đơn hàng gửi qua chat gõ vội, viết tắt',
    desc: 'Đại lý nhắn tin theo thói quen cũ không dấu, dùng tiếng lóng hoặc gửi ảnh viết tay, khiến Sales tốn nhiều thời gian gõ lại vào phần mềm.',
    consequence: 'Dễ nhầm lẫn mã SKU và số lượng khi vào đợt dồn đơn cao điểm.',
  },
  {
    num: '04',
    title: 'Việc follow-up khách hàng phụ thuộc vào trí nhớ',
    desc: 'Nhân viên kinh doanh không có công cụ nhắc việc tự động, dẫn đến việc quên chăm sóc lại các lead tiềm năng đã từng hỏi giá.',
    consequence: 'Tỷ lệ chuyển đổi đơn hàng bị sụt giảm đáng kể.',
  },
  {
    num: '05',
    title: 'Ngoại lệ chiết khấu và công nợ cần phê duyệt thủ công',
    desc: 'Khi khách hàng đàm phán giá hoặc công nợ chạm trần, việc xin ý kiến quản lý qua chat dễ bị trôi và kéo dài thời gian chốt đơn.',
    consequence: 'Khách hàng sốt ruột và trải nghiệm mua hàng bị gián đoạn.',
  },
];

const SALES_CAPABILITIES = [
  {
    icon: '⚡',
    title: 'Tiếp nhận & Chuẩn hóa nhu cầu tức thì',
    desc: 'AI tự động đọc hiểu tin nhắn đặt hàng và yêu cầu báo giá từ các kênh hội thoại, bóc tách mã sản phẩm và số lượng ngay khi nhận tin.',
    bullets: ['Ánh xạ từ viết tắt vào danh mục SKU chuẩn', 'Nhận diện thông tin người nhận và địa chỉ giao', 'Bỏ qua tin nhắn chào hỏi xã giao không liên quan'],
  },
  {
    icon: '🎯',
    title: 'Tra cứu bảng giá & Chính sách chính xác',
    desc: 'Rules Engine đối chiếu biểu giá theo đúng cấp đại lý, tính toán chiết khấu và đối soát hạn mức công nợ tất định 100% từ Nguồn sự thật.',
    bullets: ['Áp dụng đúng chính sách theo từng hồ sơ đối tác', 'Tính toán thuế VAT và phụ phí vận chuyển tự động', 'Tuyệt đối không để AI tự ý suy đoán mức giá'],
  },
  {
    icon: '🤝',
    title: 'Tự động xác nhận hoặc chuyển Sales chốt',
    desc: 'Đơn hàng trong ngưỡng an toàn tự động phát tin xác nhận; các đơn hàng dự án lớn hoặc có yêu cầu đàm phán chuyển giao ngay cho Sales phụ trách.',
    bullets: ['Hàng việc Sales bám theo ngữ cảnh tin nhắn gốc', 'Giảm 80% thời gian gõ tay nhập liệu thủ công', 'Bám sát cơ hội kinh doanh không bị bỏ sót'],
  },
  {
    icon: '📊',
    title: 'Quản trị quy trình từ Lead đến Đơn hàng',
    desc: 'Chuẩn hóa toàn bộ hành trình bán hàng từ tiếp nhận lead, sàng lọc nhu cầu, tra cứu tri thức đến chuyển giao xuất kho vận hành.',
    bullets: ['Minh bạch trạng thái từng cơ hội bán hàng', 'Nhắc việc follow-up đúng thời điểm', 'Lưu nhật ký tương tác phục vụ đánh giá'],
  },
];

const SALES_WORKFLOW = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN LEAD',
    role: 'ai' as const,
    title: 'Tiếp nhận nhu cầu từ kênh hội thoại',
    desc: 'Khách hàng hoặc đại lý nhắn tin hỏi giá hoặc đặt hàng theo thói quen trao đổi hàng ngày.',
    example: '“Báo cho anh giá 50 quạt đứng Felix và 20 máy lọc không khí về kho Nam Định”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'ĐỐI SOÁT QUY TẮC',
    role: 'rules' as const,
    title: 'Rules Engine tính giá theo cấp đại lý',
    desc: 'Hệ thống nhận diện mã đối tác, áp biểu giá đại lý Cấp 1 và kiểm tra hạn mức công nợ khả dụng trong cơ sở dữ liệu.',
    example: 'Đối tác: NPP Nam Định · Biểu giá C1 · Hạn mức công nợ: Đủ điều kiện',
  },
  {
    step: 'BƯỚC 03',
    tag: 'PHÂN LUỒNG XỬ LÝ',
    role: 'ai' as const,
    title: 'Tự động soạn báo giá hoặc chuyển Sales duyệt',
    desc: 'Với báo giá tiêu chuẩn, AI soạn thảo tin nhắn xác nhận kèm bảng giá; với đơn vượt ngưỡng, chuyển Sales duyệt.',
    example: 'Soạn báo giá chi tiết 80.500.000đ · Gửi Sales phụ trách xem xét trước khi phát tin',
  },
  {
    step: 'BƯỚC 04',
    tag: 'ĐỒNG BỘ VẬN HÀNH',
    role: 'system' as const,
    title: 'Ghi nhận vào hàng việc xuất kho tiếp theo',
    desc: 'Sau khi xác nhận thành công, đơn hàng được chuẩn hóa sẵn sàng để chuyển sang bộ phận Kho và Vận hành.',
    example: 'Đã phát tin xác nhận nhóm · Tạo thẻ việc sẵn sàng xuất kho',
  },
];

const SALES_FAQS = [
  {
    q: 'Giải pháp này có thay thế nhân viên kinh doanh không?',
    a: 'Không. Nexagnet đóng vai trò như một trợ lý thông minh hỗ trợ đội ngũ Sales giải phóng khỏi các thao tác thủ công lặp lại (tra giá, tính tiền, gõ đơn, kiểm tra nợ), giúp Sales có nhiều thời gian hơn để tư vấn chuyên sâu và chăm sóc khách hàng lớn.',
  },
  {
    q: 'Nếu khách hàng muốn đàm phán giá hoặc đòi chiết khấu thêm thì sao?',
    a: 'Hệ thống nhận diện được ý định đàm phán giá và sẽ không tự ý giảm giá. Toàn bộ hội thoại kèm đề xuất của khách sẽ lập tức được chuyển vào Hàng việc của Sales để nhân sự trực tiếp thương lượng.',
  },
  {
    q: 'Order Automation có phải là toàn bộ giải pháp cho Sales không?',
    a: 'Không. Order Automation là một module chức năng chuyên sâu về xử lý đơn hàng hội thoại. Giải pháp cho phòng Sales bao gồm toàn bộ chuỗi từ tiếp nhận lead, sàng lọc, tra cứu tri thức sản phẩm, hỗ trợ báo giá đến chuyển giao vận hành.',
  },
];

export default function SalesDepartmentPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <DepartmentHero
          breadcrumbs={[{ label: 'Phòng ban', href: '/departments' }, { label: 'Phòng Bán hàng (Sales)' }]}
          eyebrow="ỨNG DỤNG PHÒNG BAN / SALES & COMMERCIAL"
          badge="ĐỘI NGŨ KINH DOANH & ĐẠI LÝ"
          title="Giảm thao tác lặp lại từ lead đến xử lý yêu cầu bán hàng."
          subtitle="Giúp đội ngũ kinh doanh tiếp nhận yêu cầu, tra cứu báo giá và chuẩn hóa đơn hàng nhanh chóng, chính xác mà không làm thay đổi thói quen nhắn tin của đối tác."
          primaryCtaText="Trao đổi về giải pháp Bán hàng"
          supportingPill="Báo giá chuẩn xác · Bóc tách đơn tức thì · Đồng hành cùng Sales"
        />

        <DepartmentPainPoints
          eyebrow="ĐIỂM NGHẼN CỦA ĐỘI NGŨ SALES"
          title="Tại sao đội ngũ Sales thường bị quá tải khi mở rộng quy mô?"
          subtitle="Khi số lượng nhóm chat đại lý tăng từ vài chục lên hàng trăm nhóm, thời gian xử lý thủ công sẽ trở thành rào cản tăng trưởng doanh số."
          points={SALES_PAIN_POINTS}
        />

        <DepartmentCapabilities
          eyebrow="NĂNG LỰC HỖ TRỢ BÁN HÀNG"
          title="Tăng tốc độ phản hồi và chốt giao dịch."
          subtitle="Kết hợp khả năng đọc hiểu ngôn ngữ tự nhiên của AI với logic tính giá tất định từ cơ sở dữ liệu doanh nghiệp."
          capabilities={SALES_CAPABILITIES}
          columns={2}
        />

        <DepartmentWorkflow
          eyebrow="LUỒNG QUY TRÌNH HỖ TRỢ BÁN HÀNG"
          title="Từ câu hỏi khách hàng đến giao dịch được chuẩn hóa."
          subtitle="Luồng tương tác khép kín giúp phản hồi khách hàng trong vài giây mà không bao giờ báo sai giá."
          steps={SALES_WORKFLOW}
          governanceNote="Chính sách giá và chiết khấu do Rules Engine tính toán từ cơ sở dữ liệu. AI tuyệt đối không tự bịa đặt giá hay cam kết khuyến mãi ngoài danh mục."
        />

        <RelatedModules
          title="Các sản phẩm Nexagnet liên quan"
          subtitle="Khám phá các module công nghệ được phòng Sales ứng dụng nhiều nhất."
          items={[
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Tự động hóa hoàn toàn luồng bóc tách và đối soát đơn hàng B2B.',
              href: '/products/order-automation',
              badge: 'Module Tiêu biểu',
            },
            {
              title: 'Tri thức Doanh nghiệp (Knowledge)',
              desc: 'Tra cứu bảng giá, catalogue và thông số sản phẩm nhanh chóng.',
              href: '/products/knowledge',
            },
            {
              title: 'Phòng Vận hành (Operations)',
              desc: 'Chuyển giao đơn hàng đã xác nhận sang bộ phận kho xuất hàng.',
              href: '/departments/operations',
            },
          ]}
        />

        <RelatedDepartments
          title="Khám phá các phòng ban liên quan"
          subtitle="Xem cách phòng Sales kết nối với Marketing, Vận hành và Kế toán."
          currentDeptSlug="sales"
        />

        <FAQAccordion items={SALES_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
