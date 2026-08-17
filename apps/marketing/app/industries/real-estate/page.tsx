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
  title: 'AI cho Doanh nghiệp Bất động sản & Phân phối Dự án | nexagnet',
  description:
    'nexagnet có thể hỗ trợ các sàn giao dịch bất động sản giải đáp thông tin quy hoạch, bảng hàng dự án, phân loại khách tiềm năng và chuyển giao môi giới tức thì.',
  alternates: {
    canonical: 'https://nexagnet247.com/industries/real-estate',
  },
};

const RE_CHALLENGES = [
  {
    num: '01',
    title: 'Khách hàng hỏi thông tin dự án vào ban đêm',
    desc: 'Người mua nhà thường tìm hiểu dự án ngoài giờ hành chính. Môi giới không thể trực chat 24/7 khiến khách hàng dễ tìm sang đơn vị phân phối khác.',
  },
  {
    num: '02',
    title: 'Thông tin chính sách bán hàng thay đổi liên tục',
    desc: 'Chính sách chiết khấu, tiến độ thanh toán và quỹ căn cập nhật liên tục giữa chủ đầu tư và đại lý F1 khiến môi giới dễ cung cấp thông tin sai lệch.',
  },
  {
    num: '03',
    title: 'Tốn nhiều thời gian lọc khách hàng không có nhu cầu thật',
    desc: 'Môi giới mất hàng giờ gọi điện cho danh sách số điện thoại chưa được xác thực hoặc không phù hợp với phân khúc giá của dự án.',
  },
];

const RE_CAPABILITIES = [
  {
    icon: '🏙️',
    title: 'Giải đáp thông tin dự án & Pháp lý chuẩn xác',
    desc: 'Cung cấp thông tin vị trí, tiện ích, mặt bằng căn hộ và tiến độ dự án dựa trên tài liệu bán hàng chính thức của chủ đầu tư.',
    bullets: ['Tra cứu thông số diện tích và thiết kế căn hộ', 'Giải thích tiến độ thanh toán theo từng đợt', 'Không đưa ra các tư vấn đầu tư sinh lời tự do'],
  },
  {
    icon: '🎯',
    title: 'Phân loại nhu cầu & Thu thập thông tin khách hàng',
    desc: 'Tự động hỏi thăm nhu cầu ở hay đầu tư, tầm tài chính dự kiến, loại căn quan tâm và ghi nhận số điện thoại liên hệ.',
    bullets: ['Đánh giá mức độ tiềm năng của khách hàng', 'Thu thập thông tin liên hệ và khung giờ tiện gọi', 'Tự động tạo phiếu thông tin khách hàng'],
  },
  {
    icon: '📲',
    title: 'Chuyển giao chuyên viên môi giới tức thì',
    desc: 'Khi khách hàng có nhu cầu xem nhà mẫu hoặc đặt chỗ căn, hệ thống lập tức thông báo môi giới phụ trách để gọi điện tư vấn 1-1.',
    bullets: ['Phân bổ khách cho môi giới theo khu vực', 'Gửi kèm toàn bộ lịch sử trao đổi của khách', 'Giúp môi giới nắm bắt tâm lý khách trước cuộc gọi'],
  },
];

const RE_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN QUAN TÂM',
    title: 'Khách hàng nhắn tin tìm hiểu dự án',
    desc: 'Khách hàng click quảng cáo hoặc nhắn tin hỏi về căn hộ 2 phòng ngủ của dự án.',
    example: '“Cho mình hỏi căn 2PN dự án Flora City giá khoảng bao nhiêu và khi nào bàn giao?”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'TRUY XUẤT THÔNG TIN',
    title: 'Đối chiếu bảng thông tin dự án đã duyệt',
    desc: 'AI tìm kiếm diện tích, khoảng giá và tiến độ bàn giao trong tài liệu dự án chính thức.',
    example: 'Dự án: Flora City · Căn 2PN (68m²) · Giá tham khảo: 3.2 - 3.6 tỷ · Bàn giao: Q4/2026',
  },
  {
    step: 'BƯỚC 03',
    tag: 'TƯ VẤN & XÁC THỰC',
    title: 'Giải đáp chi tiết & Khảo sát nhu cầu',
    desc: 'AI trả lời thông tin đầy đủ, kèm câu hỏi gợi mở để tìm hiểu kỹ hơn mong muốn của khách hàng.',
    example: '“Căn 2PN có diện tích 68m² với giá từ 3.2 tỷ, dự kiến bàn giao Quý 4/2026. Anh/chị đang tìm mua để ở hay đầu tư ạ?”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'CHUYỂN GIAO MÔI GIỚI',
    title: 'Bàn giao chuyên viên gọi tư vấn & Hẹn xem nhà',
    desc: 'Hệ thống gửi thông tin khách hàng và lịch sử hội thoại cho môi giới phụ trách liên hệ trực tiếp.',
    example: 'Tạo phiếu khách nét: Anh Hoàng (SĐT: 0912.xxx) quan tâm căn 2PN tầng trung Flora City',
  },
];

const RE_FAQS = [
  {
    q: 'Hệ thống có đưa ra cam kết lợi nhuận đầu tư bất động sản không?',
    a: 'Tuyệt đối không. nexagnet chỉ cung cấp các thông tin khách quan về dự án, thiết kế, tiến độ và chính sách thanh toán theo văn bản đã duyệt của chủ đầu tư. Mọi quyết định và tư vấn chuyên sâu đều do đội ngũ môi giới trực tiếp thực hiện.',
  },
  {
    q: 'Hệ thống có tích hợp được bảng hàng thời gian thực (realtime) không?',
    a: 'Khi doanh nghiệp kết nối cơ sở dữ liệu bảng hàng qua API, nexagnet có thể hỗ trợ kiểm tra trạng thái căn (còn/đã cọc). Nếu chưa có API, hệ thống sẽ sử dụng bảng giá và chính sách định kỳ đã cập nhật.',
  },
  {
    q: 'Làm thế nào để môi giới nhận được thông báo khi có khách hàng tiềm năng?',
    a: 'Hệ thống có thể gửi thông báo tức thì qua Zalo, Telegram hoặc tạo công việc trực tiếp trên phần mềm CRM của sàn giao dịch kèm số điện thoại và tóm tắt nhu cầu của khách.',
  },
];

export default function RealEstateIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Bất động sản' }]}
          eyebrow="ỨNG DỤNG NGÀNH / REAL ESTATE"
          badge="DỰ ÁN & PHÂN PHỐI"
          title="AI cho Doanh nghiệp Bất động sản & Phân phối Dự án"
          subtitle="nexagnet có thể hỗ trợ các sàn giao dịch bất động sản giải đáp thông tin quy hoạch, bảng hàng dự án, phân loại khách tiềm năng và chuyển giao môi giới tức thì mà không bỏ sót cơ hội."
          primaryCtaText="Yêu cầu Tư vấn Bất động sản"
          supportingPill="Thông tin dự án chuẩn · Phân loại khách nét · Chuyển giao môi giới"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN BẤT ĐỘNG SẢN THỰC TẾ"
          title="Những rào cản trong chuyển đổi khách hàng bất động sản"
          subtitle="Tốc độ tiếp cận khách hàng trong 5 phút đầu tiên sau khi đăng ký quan tâm quyết định đến 70% khả năng chốt giao dịch."
          challenges={RE_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO BẤT ĐỘNG SẢN"
          title="Tăng tốc độ kết nối giữa khách hàng và môi giới."
          subtitle="Giữ chân khách hàng quan tâm bằng câu trả lời tức thì, chính xác và chuyên nghiệp vào bất kỳ thời điểm nào."
          features={RE_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH TƯ VẤN & BÀN GIAO"
          title="Từ tin nhắn tìm hiểu đến cuộc hẹn xem nhà mẫu."
          subtitle="Môi giới tiếp nhận khách hàng với đầy đủ thông tin nhu cầu, tiết kiệm thời gian khảo sát ban đầu."
          steps={RE_STEPS}
        />

        <ControlCallout
          title="Thông tin dự án chuẩn mực, tôn trọng pháp lý bất động sản."
          desc="nexagnet không đưa ra các cam kết sinh lời hay tư vấn tài chính vượt thẩm quyền. Mọi thông tin dự án đều tham chiếu từ tài liệu chính thức của chủ đầu tư."
        />

        <RelatedModules
          title="Các sản phẩm liên quan"
          subtitle="Kết hợp các module nexagnet để tối ưu hóa hiệu quả bán hàng dự án."
          items={[
            {
              title: 'Giải pháp Bán hàng & Phân phối',
              desc: 'Hỗ trợ đội ngũ kinh doanh tiếp nhận và phân bổ cơ hội bán hàng mượt mà.',
              href: '/solutions/sales',
            },
            {
              title: 'Tri thức Nội bộ & Dự án',
              desc: 'Quản trị tập trung thông tin quy hoạch, chính sách bán hàng của chủ đầu tư.',
              href: '/solutions/internal-knowledge',
            },
            {
              title: 'Kiểm soát & Quản trị AI',
              desc: 'Đảm bảo nội dung tư vấn tuân thủ quy chuẩn pháp lý và tài liệu dự án.',
              href: '/platform/control',
            },
          ]}
        />

        <FAQAccordion items={RE_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
