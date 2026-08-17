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
  title: 'AI cho Trải nghiệm Khách hàng ngành Spa & Thẩm mỹ | nexagnet',
  description:
    'nexagnet có thể hỗ trợ các cơ sở spa và thẩm mỹ tự động hóa tư vấn dịch vụ, tiếp nhận thông tin lịch hẹn và chăm sóc khách hàng 24/7 với sự kiểm soát của nhân sự.',
  alternates: {
    canonical: 'https://nexagnet247.com/industries/spa-beauty',
  },
};

const SPA_CHALLENGES = [
  {
    num: '01',
    title: 'Khách hàng hỏi thông tin dịch vụ lặp lại',
    desc: 'Lượng lớn tin nhắn đổ về Fanpage/Zalo hỏi về giá dịch vụ, thời gian thực hiện, quy trình chăm sóc và ưu đãi hiện có khiến nhân sự tư vấn quá tải.',
  },
  {
    num: '02',
    title: 'Nhân viên tư vấn không đồng đều về liệu trình',
    desc: 'Bảng giá dịch vụ và các chương trình ưu đãi thay đổi liên tục khiến nhân sự mới dễ báo nhầm giá hoặc tư vấn không đúng quy chuẩn của cơ sở.',
  },
  {
    num: '03',
    title: 'Khách hỏi dịch vụ ngoài giờ làm việc bị bỏ lỡ',
    desc: 'Nhu cầu tìm hiểu làm đẹp thường tăng cao vào buổi tối và cuối tuần. Việc phản hồi chậm trễ khiến khách hàng dễ chuyển sang cơ sở khác.',
  },
];

const SPA_CAPABILITIES = [
  {
    icon: '✨',
    title: 'Tư vấn thông tin dịch vụ & Bảng giá chuẩn',
    desc: 'Giải đáp thắc mắc về các gói chăm sóc da, thư giãn và làm đẹp dựa trên tài liệu dịch vụ đã được cơ sở phê duyệt.',
    bullets: ['Cung cấp thông tin bảng giá và thời lượng dịch vụ', 'Giải thích quy trình chăm sóc tiêu chuẩn', 'Không đưa ra chẩn đoán y khoa hay cam kết điều trị'],
  },
  {
    icon: '📅',
    title: 'Tiếp nhận thông tin & Hỗ trợ đặt lịch hẹn',
    desc: 'Tự động thu thập nhu cầu, thời gian mong muốn và số điện thoại của khách hàng, sau đó chuyển giao cho Lễ tân xác nhận lịch.',
    bullets: ['Ghi nhận khung giờ và cơ sở khách muốn đến', 'Kiểm tra thông tin liên hệ khách hàng', 'Chuyển phiếu đặt lịch sang hàng việc Lễ tân'],
  },
  {
    icon: '🌸',
    title: 'Nhắc lịch hẹn & Chăm sóc sau dịch vụ',
    desc: 'Gửi tin nhắn tự động nhắc khách lịch hẹn sắp tới hoặc hướng dẫn chăm sóc tại nhà sau liệu trình theo hàng đợi an toàn.',
    bullets: ['Nhắc lịch hẹn trước 2–4 tiếng', 'Gửi hướng dẫn dưỡng da cơ bản sau khi làm đẹp', 'Thu thập phản hồi đánh giá sự hài lòng'],
  },
];

const SPA_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN YÊU CẦU',
    title: 'Khách hàng nhắn tin hỏi dịch vụ làm đẹp',
    desc: 'Khách hàng gửi câu hỏi qua Fanpage Messenger hoặc Zalo cơ sở vào bất kỳ lúc nào.',
    example: '“Gói chăm sóc da chuyên sâu bên bạn giá bao nhiêu và mất khoảng bao lâu vậy?”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'TRÍCH XUẤT THÔNG TIN',
    title: 'Đối chiếu bảng dịch vụ trong Nguồn sự thật',
    desc: 'AI tìm kiếm thông tin dịch vụ chăm sóc da trong catalogue đã duyệt của spa.',
    example: 'Dịch vụ: Chăm sóc da chuyên sâu 75 phút · Giá niêm yết: 450.000đ · Ưu đãi: Giảm 20% lần đầu',
  },
  {
    step: 'BƯỚC 03',
    tag: 'TƯ VẤN & THU THẬP',
    title: 'Phản hồi chi tiết & Hỏi nhu cầu đặt lịch',
    desc: 'AI gửi câu trả lời lịch sự, đầy đủ thông tin và gợi ý thời gian để khách lựa chọn.',
    example: '“Dạ gói chăm sóc da 75 phút bên em có giá 450k (đang ưu đãi 20% còn 360k). Chị muốn ghé cơ sở vào khung giờ nào ạ?”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'BÀN GIAO LỄ TÂN',
    title: 'Chuyển thông tin lịch hẹn cho Lễ tân xác nhận',
    desc: 'Hệ thống tạo phiếu yêu cầu trên Hàng việc để nhân viên Lễ tân gọi điện/nhắn tin chốt lịch chính thức.',
    example: 'Đã tạo phiếu: Khách đặt lịch Chăm sóc da lúc 15:00 Chủ Nhật tại Cơ sở 1',
  },
];

const SPA_FAQS = [
  {
    q: 'Hệ thống có đưa ra lời khuyên y khoa hoặc chẩn đoán da liễu không?',
    a: 'Tuyệt đối không. nexagnet được thiết kế tuân thủ nguyên tắc an toàn nghiêm ngặt: hệ thống chỉ cung cấp thông tin mô tả dịch vụ, bảng giá và tiếp nhận lịch hẹn. Mọi trường hợp cần đánh giá tình trạng da liễu đều được hướng dẫn đến thăm khám trực tiếp với chuyên gia tại cơ sở.',
  },
  {
    q: 'Lễ tân có thể kiểm soát và xem lại các tin nhắn tư vấn không?',
    a: 'Có. Toàn bộ lịch sử trao đổi của khách hàng đều được hiển thị đầy đủ trên giao diện điều hành để nhân viên Lễ tân nắm bắt nhu cầu trước khi tiếp đón khách.',
  },
  {
    q: 'Hệ thống có tự động gửi tin nhắn nhắc lịch cho khách hàng được không?',
    a: 'Có. nexagnet hỗ trợ tính năng gửi tin nhắn nhắc lịch tự động trước giờ hẹn qua Zalo/SMS giúp giảm thiểu tối đa tình trạng khách quên lịch hoặc đến muộn.',
  },
];

export default function SpaBeautyIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Spa & Thẩm mỹ' }]}
          eyebrow="ỨNG DỤNG NGÀNH / SPA & BEAUTY"
          badge="DỊCH VỤ & LÀM ĐẸP"
          title="AI cho Trải nghiệm Khách hàng ngành Spa & Thẩm mỹ"
          subtitle="nexagnet có thể hỗ trợ các cơ sở spa và thẩm mỹ tự động hóa tư vấn dịch vụ, tiếp nhận nhu cầu đặt lịch và chăm sóc khách hàng 24/7 — đồng thời giữ nhân viên ở những tình huống cần sự tư vấn chuyên sâu."
          primaryCtaText="Yêu cầu Tư vấn Giải pháp Spa"
          supportingPill="Tư vấn dịch vụ 24/7 · Hỗ trợ tiếp nhận lịch · Chăm sóc sau liệu trình"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN THỰC TẾ NGÀNH LÀM ĐẸP"
          title="Những thách thức trong tư vấn và tiếp đón khách hàng"
          subtitle="Khách hàng làm đẹp đòi hỏi sự chăm sóc chu đáo, thông tin rõ ràng và phản hồi nhanh chóng ngay từ lần liên hệ đầu tiên."
          challenges={SPA_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO SPA & THẨM MỸ"
          title="Nâng tầm trải nghiệm khách hàng, tối ưu lịch hẹn."
          subtitle="Tự động hóa các tác vụ lặp lại để đội ngũ kỹ thuật viên và lễ tân tập trung tối đa vào chất lượng dịch vụ trực tiếp."
          features={SPA_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH TIẾP NHẬN & ĐẶT LỊCH"
          title="Từ câu hỏi làm đẹp đến lịch hẹn được xác nhận."
          subtitle="Quy trình chuyên nghiệp, thân thiện và luôn có sự kiểm tra xác nhận của nhân viên lễ tân."
          steps={SPA_STEPS}
        />

        <ControlCallout
          title="An toàn thông tin và tuân thủ chuẩn mực ngành dịch vụ."
          desc="nexagnet không đưa ra các phác đồ y khoa lâm sàng. Mọi thông tin tư vấn đều bám sát tài liệu dịch vụ đã được cơ sở thẩm định và phê duyệt."
        />

        <RelatedModules
          title="Các sản phẩm liên quan"
          subtitle="Kết hợp các module nexagnet để xây dựng trải nghiệm khách hàng toàn diện."
          items={[
            {
              title: 'Giải pháp Chăm sóc Khách hàng',
              desc: 'Mô hình hỗ trợ khách hàng đa kênh 24/7 với sự kiểm soát của con người.',
              href: '/solutions/customer-service',
            },
            {
              title: 'Tri thức Nội bộ & Quy trình',
              desc: 'Quản trị cẩm nang dịch vụ và quy chuẩn phục vụ của cơ sở thẩm mỹ.',
              href: '/solutions/internal-knowledge',
            },
            {
              title: 'Kiểm soát & Quản trị AI',
              desc: 'Cơ chế kiểm soát an toàn và bảo mật dữ liệu khách hàng theo pháp luật.',
              href: '/platform/control',
            },
          ]}
        />

        <FAQAccordion items={SPA_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
