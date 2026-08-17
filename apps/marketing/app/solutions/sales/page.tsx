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
  title: 'AI Hỗ trợ Đội ngũ Bán hàng & Phân phối | nexagnet',
  description:
    'Giúp đội ngũ kinh doanh tiếp nhận yêu cầu, tra cứu báo giá và chuẩn hóa đơn hàng nhanh hơn, nhất quán hơn mà không làm mất thói quen nhắn tin của đối tác.',
  alternates: {
    canonical: 'https://nexagnet247.com/solutions/sales',
  },
};

const SALES_CHALLENGES = [
  {
    num: '01',
    title: 'Quá tải tin nhắn hỏi giá và tồn kho',
    desc: 'Đại lý và khách hàng liên tục nhắn tin hỏi giá, hỏi thông số sản phẩm cả ngày lẫn đêm khiến Sales mất nhiều thời gian tra cứu bảng tính Excel.',
  },
  {
    num: '02',
    title: 'Đơn hàng gửi qua chat gõ vội, viết tắt',
    desc: 'Khách hàng nhắn tin theo thói quen cũ không dấu, dùng từ lóng hoặc gửi ảnh viết tay, dễ dẫn đến việc nhân viên đọc nhầm mã hoặc nhập sai số lượng.',
  },
  {
    num: '03',
    title: 'Áp lực đối soát chính sách và công nợ',
    desc: 'Vào các đợt cao điểm hoặc cuối tháng, việc nhầm lẫn cấp giá đại lý, quên kiểm tra hạn mức công nợ cũ gây rủi ro tài chính trực tiếp cho công ty.',
  },
];

const SALES_CAPABILITIES = [
  {
    icon: '⚡',
    title: 'Tiếp nhận & Chuẩn hóa nhu cầu tức thì',
    desc: 'AI tự động đọc hiểu tin nhắn đặt hàng và yêu cầu báo giá từ các kênh hội thoại, trích xuất mã sản phẩm và số lượng ngay khi nhận tin.',
    bullets: ['Ánh xạ từ viết tắt vào danh mục SKU chuẩn', 'Nhận diện thông tin người nhận và địa chỉ giao', 'Bỏ qua tin nhắn chào hỏi xã giao không liên quan'],
  },
  {
    icon: '🎯',
    title: 'Tra cứu bảng giá & Chính sách chính xác',
    desc: 'Rules Engine đối chiếu biểu giá theo đúng cấp đại lý, tính toán chiết khấu và đối soát hạn mức công nợ tất định 100% từ Nguồn sự thật.',
    bullets: ['Áp dụng đúng chính sách theo từng hồ sơ đối tác', 'Tính toán thuế VAT và phụ phí vận chuyển tự động', 'Không để AI tự bịa đặt mức giá'],
  },
  {
    icon: '🤝',
    title: 'Tự động xác nhận hoặc chuyển Sales chốt',
    desc: 'Đơn hàng trong ngưỡng an toàn tự động phát tin xác nhận; các đơn hàng dự án lớn hoặc có yêu cầu đàm phán chuyển giao ngay cho Sales phụ trách.',
    bullets: ['Hàng việc Sales bám theo ngữ cảnh tin nhắn gốc', 'Giảm 80% thời gian gõ tay nhập liệu', 'Bám sát cơ hội kinh doanh không bị bỏ sót'],
  },
];

const SALES_STEPS = [
  {
    step: 'GIAI ĐOẠN 1',
    tag: 'TIẾP NHẬN YÊU CẦU',
    title: 'Tiếp nhận tin nhắn từ Zalo / Kênh đối tác',
    desc: 'Khách hàng nhắn tin tự nhiên hỏi giá hoặc đặt hàng theo thói quen trao đổi hàng ngày.',
    example: '“Báo cho anh giá 50 quạt đứng và 20 máy lọc không khí về kho Hải Phòng”',
  },
  {
    step: 'GIAI ĐOẠN 2',
    tag: 'ĐỐI SOÁT & TÍNH TOÁN',
    title: 'Rules Engine tính giá theo cấp đại lý',
    desc: 'Hệ thống nhận diện mã đối tác, áp biểu giá đại lý Cấp 1 và kiểm tra hạn mức công nợ khả dụng.',
    example: 'Đối tác: NPP Duyên Hải · Biểu giá C1 · Hạn mức công nợ: Đủ điều kiện',
  },
  {
    step: 'GIAI ĐOẠN 3',
    tag: 'PHÂN LUỒNG XỬ LÝ',
    title: 'Tự động phản hồi hoặc chuyển Sales duyệt',
    desc: 'Với báo giá tiêu chuẩn, AI soạn thảo tin nhắn xác nhận kèm bảng giá; với đơn vượt ngưỡng, chuyển Sales duyệt.',
    example: 'Soạn báo giá chi tiết 87.500.000đ · Chuyển Trưởng nhóm Sale xem xét duyệt chiết khấu đặc biệt',
  },
  {
    step: 'GIAI ĐOẠN 4',
    tag: 'ĐỒNG BỘ VẬN HÀNH',
    title: 'Ghi nhận vào hàng việc xử lý tiếp theo',
    desc: 'Sau khi xác nhận thành công, đơn hàng được chuẩn hóa sẵn sàng để Sales tạo đơn xuất hàng trên phần mềm quản trị.',
    example: 'Đã phát tin xác nhận nhóm · Tạo hàng việc sẵn sàng xuất kho',
  },
];

const SALES_FAQS = [
  {
    q: 'Giải pháp này có thay thế nhân viên kinh doanh không?',
    a: 'Không. nexagnet đóng vai trò như một trợ lý thông minh hỗ trợ đội ngũ Sales giải phóng khỏi các thao tác thủ công lặp lại (tra giá, tính tiền, gõ đơn, kiểm tra nợ), giúp Sales có nhiều thời gian hơn để tư vấn chuyên sâu và chăm sóc khách hàng lớn.',
  },
  {
    q: 'Nếu khách hàng muốn đàm phán giá hoặc đòi chiết khấu thêm thì sao?',
    a: 'Hệ thống nhận diện được ý định đàm phán giá và sẽ không tự ý giảm giá. Toàn bộ hội thoại kèm đề xuất của khách sẽ lập tức được chuyển vào Hàng việc của Sales để nhân sự trực tiếp thương lượng.',
  },
  {
    q: 'Giải pháp có hỗ trợ cả kênh Zalo cá nhân lẫn Zalo nhóm không?',
    a: 'Có. nexagnet hỗ trợ kết nối linh hoạt với cả các nhóm chat đối tác, tin nhắn 1-1 lẫn kênh Zalo OA chính thức theo kiến trúc phù hợp với mô hình vận hành của từng doanh nghiệp.',
  },
];

export default function SalesSolutionPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Giải pháp', href: '/#solutions' }, { label: 'Bán hàng & Phân phối' }]}
          eyebrow="GIẢI PHÁP / SALES & DISTRIBUTION"
          badge="ỨNG DỤNG THỰC TẾ"
          title="AI Hỗ trợ Đội ngũ Bán hàng & Phân phối"
          subtitle="Giúp đội ngũ kinh doanh tiếp nhận yêu cầu, tra cứu báo giá và chuẩn hóa đơn hàng nhanh chóng, chính xác mà không làm thay đổi thói quen nhắn tin của đối tác."
          primaryCtaText="Yêu cầu Tư vấn Giải pháp Bán hàng"
          supportingPill="Báo giá chuẩn xác · Bóc tách đơn tức thì · Đồng hành cùng Sales"
        />

        <IndustryChallenges
          eyebrow="ĐIỂM NGHẼN BÁN HÀNG HIỆN NAY"
          title="Tại sao đội ngũ Sales thường bị quá tải khi mở rộng quy mô?"
          subtitle="Khi số lượng nhóm chat đại lý tăng từ vài chục lên hàng trăm nhóm, thời gian xử lý thủ công sẽ trở thành rào cản tăng trưởng doanh số."
          challenges={SALES_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC HỖ TRỢ BÁN HÀNG"
          title="Tăng tốc độ phản hồi và chốt giao dịch."
          subtitle="Kết hợp khả năng đọc hiểu ngôn ngữ tự nhiên của AI với logic tính giá tất định từ cơ sở dữ liệu doanh nghiệp."
          features={SALES_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH HỖ TRỢ BÁN HÀNG"
          title="Từ câu hỏi khách hàng đến giao dịch được chuẩn hóa."
          subtitle="Luồng tương tác khép kín giúp phản hồi khách hàng trong vài giây mà không bao giờ báo sai giá."
          steps={SALES_STEPS}
        />

        <ControlCallout
          title="Chính sách giá và chiết khấu luôn được kiểm soát chặt chẽ."
          desc="AI không bao giờ tự ý sửa đổi mức giá hay cam kết khuyến mãi ngoài danh mục. Mọi ngoại lệ đều yêu cầu nhân viên kinh doanh phê duyệt."
        />

        <RelatedModules
          title="Các phân hệ công nghệ bổ trợ"
          subtitle="Kết hợp giải pháp Bán hàng với các sản phẩm chuyên biệt của nexagnet để tối ưu hóa hiệu quả."
          items={[
            {
              title: 'Xử lý Đơn hàng (Order Automation)',
              desc: 'Tự động hóa hoàn toàn luồng bóc tách và đối soát đơn hàng B2B.',
              href: '/products/order-automation',
              badge: 'Tiêu biểu',
            },
            {
              title: 'Giải pháp Vận hành Doanh nghiệp',
              desc: 'Tự động hóa quy trình phân luồng và quản trị công việc kinh doanh.',
              href: '/solutions/operations',
            },
            {
              title: 'Kiểm soát & Quản trị AI',
              desc: 'Đảm bảo Rules Engine tính giá và công nợ tất định 100% từ CSDL chuẩn.',
              href: '/platform/control',
            },
          ]}
        />

        <FAQAccordion items={SALES_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
