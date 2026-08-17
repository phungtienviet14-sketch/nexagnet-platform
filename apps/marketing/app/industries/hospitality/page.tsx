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
  title: 'AI cho Doanh nghiệp Khách sạn & Dịch vụ Lưu trú | nexagnet',
  description:
    'nexagnet có thể hỗ trợ các khách sạn, khu nghỉ dưỡng và đơn vị dịch vụ giải đáp thông tin tiện ích, tiếp nhận nhu cầu đặt phòng và hỗ trợ khách lưu trú 24/7.',
  alternates: {
    canonical: 'https://nexagnet247.com/industries/hospitality',
  },
};

const HOSP_CHALLENGES = [
  {
    num: '01',
    title: 'Khách hàng hỏi thông tin phòng và tiện ích liên tục',
    desc: 'Khách du lịch thường nhắn tin hỏi về chính sách nhận/trả phòng, quy định trẻ em, thực đơn nhà hàng, dịch vụ đưa đón sân bay và các ưu đãi hiện có.',
  },
  {
    num: '02',
    title: 'Rào cản ngôn ngữ và hỗ trợ ngoài giờ',
    desc: 'Khách quốc tế hoặc khách đến muộn vào ban đêm thường cần giải đáp ngay các yêu cầu cơ bản trong khi nhân viên trực ca đêm có hạn.',
  },
  {
    num: '03',
    title: 'Bỏ lỡ các cơ hội đặt dịch vụ gia tăng (Upsell)',
    desc: 'Lễ tân bận rộn không có thời gian giới thiệu thêm các dịch vụ spa, tour tham quan hay đặt bàn ăn tối cho khách trước ngày nhận phòng.',
  },
];

const HOSP_CAPABILITIES = [
  {
    icon: '🏨',
    title: 'Giải đáp thông tin phòng & Tiện ích chuẩn xác',
    desc: 'Cung cấp thông tin chi tiết về các hạng phòng, tiện nghi, quy định nhận phòng và dịch vụ đưa đón theo cẩm nang khách sạn đã duyệt.',
    bullets: ['Mô tả diện tích phòng, hướng nhìn và trang thiết bị', 'Giải thích chính sách phụ thu trẻ em và hủy phòng', 'Hướng dẫn đường đi và dịch vụ tiện ích xung quanh'],
  },
  {
    icon: '🛎️',
    title: 'Tiếp nhận nhu cầu & Thu thập thông tin đặt phòng',
    desc: 'Tự động ghi nhận ngày đến, ngày đi, số lượng khách, hạng phòng mong muốn và chuyển giao cho bộ phận Đặt phòng (Reservation) xác nhận.',
    bullets: ['Thu thập ngày lưu trú và số lượng khách', 'Ghi nhận các yêu cầu đặc biệt (phòng không hút thuốc, tầng cao)', 'Chuyển phiếu yêu cầu sang hàng việc bộ phận Đặt phòng'],
  },
  {
    icon: '🍽️',
    title: 'Hỗ trợ khách lưu trú & Giới thiệu dịch vụ gia tăng',
    desc: 'Hỗ trợ giải đáp menu nhà hàng, đặt dịch vụ xe đưa đón hoặc hướng dẫn sử dụng tiện ích trong khuôn viên khách sạn trong suốt kỳ nghỉ.',
    bullets: ['Tư vấn thực đơn và giờ hoạt động của nhà hàng/spa', 'Tiếp nhận yêu cầu thêm gối, dọn phòng chuyển Lễ tân', 'Không tự ý cam kết vượt quy định của khách sạn'],
  },
];

const HOSP_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN YÊU CẦU',
    title: 'Khách hàng nhắn tin hỏi thông tin lưu trú',
    desc: 'Khách gửi câu hỏi qua Fanpage, Zalo hoặc Website của resort về phòng nghỉ cuối tuần.',
    example: '“Gia đình mình 2 người lớn 1 bé 4 tuổi muốn đặt phòng hướng biển ngày 20-22/8 giá thế nào bạn?”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'TRUY VẤN TIỆN ÍCH',
    title: 'Đối chiếu cẩm nang dịch vụ khách sạn',
    desc: 'AI tìm kiếm mức giá tham khảo, chính sách trẻ em và tiện nghi phòng Suite hướng biển trong tài liệu.',
    example: 'Hạng phòng: Ocean View Suite · Giá tham khảo: 2.800.000đ/đêm · Chính sách: Miễn phí 01 trẻ em dưới 6 tuổi',
  },
  {
    step: 'BƯỚC 03',
    tag: 'TƯ VẤN & XÁC NHẬN',
    title: 'Giải đáp chi tiết & Khảo sát thông tin liên hệ',
    desc: 'AI gửi câu trả lời rõ ràng, bao gồm giá phòng, bữa sáng buffet và hỏi thông tin để giữ phòng.',
    example: '“Dạ phòng Ocean View Suite ngày 20-22/8 có giá 2.800.000đ/đêm (đã gồm buffet sáng, bé 4 tuổi miễn phí phụ thu). Anh/chị cho em xin tên và SĐT để bộ phận Đặt phòng gửi báo giá chính thức nhé ạ.”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'BÀN GIAO ĐẶT PHÒNG',
    title: 'Chuyển phiếu cho Bộ phận Đặt phòng (Reservation)',
    desc: 'Hệ thống gửi thông tin khách và chi tiết ngày lưu trú cho nhân viên Đặt phòng gọi xác nhận và gửi hướng dẫn cọc.',
    example: 'Đã tạo phiếu yêu cầu: Khách Anh Minh (0903.xxx) đặt Ocean View Suite ngày 20-22/8',
  },
];

const HOSP_FAQS = [
  {
    q: 'Hệ thống có tự động trừ tiền thẻ tín dụng hay giữ phòng trên hệ thống PMS không?',
    a: 'Trong giai đoạn đầu, nexagnet đóng vai trò tiếp nhận nhu cầu, tư vấn dịch vụ và thu thập thông tin đặt phòng chuyển giao cho bộ phận Reservation xác nhận. Khi khách sạn có API kết nối với hệ thống PMS/Channel Manager, nexagnet có thể hỗ trợ kiểm tra tình trạng phòng tự động.',
  },
  {
    q: 'Hệ thống có thể trả lời khách bằng nhiều ngôn ngữ khác nhau không?',
    a: 'Có. nexagnet có khả năng nhận diện và giao tiếp tự nhiên bằng nhiều ngôn ngữ phổ biến (Tiếng Việt, Tiếng Anh, Tiếng Trung, Tiếng Hàn) theo nội dung tài liệu dịch vụ đã được chuẩn hóa.',
  },
  {
    q: 'Khi khách lưu trú cần hỗ trợ gấp tại phòng thì sao?',
    a: 'Nếu khách gửi tin nhắn yêu cầu hỗ trợ khẩn cấp (như cần thêm khăn, báo hỏng thiết bị điện), hệ thống sẽ lập tức tạo thông báo ưu tiên cao chuyển đến Lễ tân/Buồng phòng để xử lý ngay.',
  },
];

export default function HospitalityIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Khách sạn & Dịch vụ' }]}
          eyebrow="ỨNG DỤNG NGÀNH / HOSPITALITY & SERVICES"
          badge="LƯU TRÚ & NGHỈ DƯỠNG"
          title="AI cho Doanh nghiệp Khách sạn & Dịch vụ Lưu trú"
          subtitle="nexagnet có thể hỗ trợ các khách sạn, khu nghỉ dưỡng và đơn vị lưu trú giải đáp thông tin tiện ích, tiếp nhận nhu cầu đặt phòng và chăm sóc khách hàng 24/7."
          primaryCtaText="Yêu cầu Tư vấn Khách sạn & Dịch vụ"
          supportingPill="Tư vấn dịch vụ 24/7 · Thu thập nhu cầu đặt phòng · Chăm sóc khách lưu trú"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN NGÀNH KHÁCH SẠN THỰC TẾ"
          title="Những thách thức trong giao tiếp và phục vụ du khách"
          subtitle="Trải nghiệm của du khách bắt đầu từ khoảnh khắc họ nhắn tin tìm hiểu trước chuyến đi cho đến khi rời khách sạn."
          challenges={HOSP_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO KHÁCH SẠN"
          title="Phục vụ tận tâm, phản hồi nhanh chóng mọi thời điểm."
          subtitle="Tự động hóa các câu hỏi thường gặp để đội ngũ nhân viên tập trung mang lại dịch vụ trực tiếp hoàn hảo nhất."
          features={HOSP_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH TIẾP NHẬN & PHỤC VỤ"
          title="Từ tin nhắn tìm hiểu đến trải nghiệm kỳ nghỉ trọn vẹn."
          subtitle="Du khách luôn nhận được thông tin rõ ràng và được bộ phận chuyên trách chăm sóc kịp thời."
          steps={HOSP_STEPS}
        />

        <ControlCallout
          title="Thông tin dịch vụ chuẩn xác, giữ vững uy tín khách sạn."
          desc="nexagnet không tự ý thay đổi chính sách giá hay đưa ra cam kết vượt thẩm quyền. Mọi thông tin đều đối soát từ cẩm nang dịch vụ đã duyệt của khách sạn."
        />

        <RelatedModules
          title="Các sản phẩm liên quan"
          subtitle="Tích hợp các module nexagnet để nâng tầm trải nghiệm lưu trú."
          items={[
            {
              title: 'Giải pháp Chăm sóc Khách hàng',
              desc: 'Mô hình hỗ trợ đa kênh 24/7 cho ngành dịch vụ lưu trú với sự kiểm soát của con người.',
              href: '/solutions/customer-service',
            },
            {
              title: 'Tri thức Nội bộ & Cẩm nang Dịch vụ',
              desc: 'Quản trị cẩm nang dịch vụ, thực đơn nhà hàng và quy định lưu trú của khách sạn.',
              href: '/solutions/internal-knowledge',
            },
            {
              title: 'Hạ tầng Tích hợp & Kết nối',
              desc: 'Kiến trúc sẵn sàng kết nối cùng hệ thống quản lý PMS và cổng thanh toán.',
              href: '/platform/integrations',
            },
          ]}
        />

        <FAQAccordion items={HOSP_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
