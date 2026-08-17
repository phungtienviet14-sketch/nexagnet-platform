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
  title: 'AI Chăm sóc Khách hàng & Phản hồi 24/7 | nexagnet',
  description:
    'Hỗ trợ giải đáp thắc mắc khách hàng 24/7 với câu trả lời nhất quán theo văn bản tài liệu đã duyệt và bàn giao chuyên viên mượt mà khi có khiếu nại.',
  alternates: {
    canonical: 'https://nexagnet247.com/solutions/customer-service',
  },
};

const CS_CHALLENGES = [
  {
    num: '01',
    title: 'Khối lượng câu hỏi lặp lại chiếm 70% thời gian',
    desc: 'Nhân viên CSKH phải liên tục gõ lại các câu trả lời về hướng dẫn sử dụng, chính sách đổi trả, thời gian giao hàng và địa chỉ bảo hành.',
  },
  {
    num: '02',
    title: 'Câu trả lời không nhất quán giữa các ca trực',
    desc: 'Nhân sự mới hoặc làm việc ngoài giờ thường không nắm rõ toàn bộ quy chế mới cập nhật, dẫn đến việc tư vấn sai cam kết với khách hàng.',
  },
  {
    num: '03',
    title: 'Khách hàng nhắn tin ngoài giờ làm việc bị bỏ lỡ',
    desc: 'Khách hỏi dịch vụ hoặc khiếu nại vào ban đêm, ngày nghỉ cuối tuần không được hỗ trợ kịp thời, làm giảm mức độ hài lòng và tỷ lệ giữ chân.',
  },
];

const CS_CAPABILITIES = [
  {
    icon: '🌙',
    title: 'Hỗ trợ tức thì 24/7 không gián đoạn',
    desc: 'Tiếp nhận và giải đáp ngay lập tức các thắc mắc thông thường của khách hàng vào bất kỳ thời điểm nào trong ngày.',
    bullets: ['Phản hồi tức thì trong vài giây', 'Giải quyết triệt để 70-80% câu hỏi lặp lại', 'Duy trì trải nghiệm giao tiếp liền mạch'],
  },
  {
    icon: '📖',
    title: 'Phản hồi chuẩn mực theo tài liệu đã duyệt',
    desc: 'Mọi câu trả lời đều dựa trên nguồn tài liệu chính sách nội bộ (Knowledge Base), đảm bảo tính chính xác và nhất quán tuyệt đối.',
    bullets: ['Trích xuất từ quy chế bảo hành và sổ tay sản phẩm', 'Không đưa ra các cam kết vượt thẩm quyền', 'Ghi rõ nguồn tài liệu tham chiếu'],
  },
  {
    icon: '🛎️',
    title: 'Chuyển giao chuyên viên kèm tóm tắt hội thoại',
    desc: 'Khi phát hiện khiếu nại bồi thường hoặc ca hỗ trợ phức tạp, hệ thống tự động tóm tắt ngữ cảnh và thông báo chuyên viên tiếp quản.',
    bullets: ['Nhận diện cảm xúc bức xúc hoặc yêu cầu gặp người thật', 'Tạo hàng việc CSKH kèm toàn bộ lịch sử tin nhắn', 'Khách hàng không phải giải thích lại từ đầu'],
  },
];

const CS_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN YÊU CẦU',
    title: 'Khách hàng nhắn tin qua Zalo / Messenger / Web',
    desc: 'Hệ thống lắng nghe và tiếp nhận câu hỏi của khách hàng trên các kênh tương tác chính.',
    example: '“Cho mình hỏi máy lọc nước bên bạn có hỗ trợ lắp đặt tại nhà ở Cần Thơ không?”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'TRUY VẤN TRI THỨC',
    title: 'Đối chiếu chính sách dịch vụ trong Nguồn sự thật',
    desc: 'AI tìm kiếm thông tin quy định lắp đặt và phạm vi phục vụ theo khu vực trong tài liệu CSKH.',
    example: 'Chính sách: Lắp đặt miễn phí nội thành Hà Nội & TP.HCM · Tỉnh khác: Phí 150k hoặc gửi video hướng dẫn',
  },
  {
    step: 'BƯỚC 03',
    tag: 'PHẢN HỒI CHUẨN XÁC',
    title: 'Trả lời nhanh chóng kèm hướng dẫn chi tiết',
    desc: 'AI gửi câu trả lời rõ ràng, lịch sự và giải thích đầy đủ các phương án để khách hàng lựa chọn.',
    example: '“Dạ tại Cần Thơ, bên em hỗ trợ gửi hàng kèm video hướng dẫn tự lắp đặt hoặc kỹ thuật viên đến nhà với phí hỗ trợ 150.000đ ạ.”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'BÀN GIAO CHUYÊN VIÊN',
    title: 'Chuyển ca phức tạp sang hàng việc nhân sự',
    desc: 'Nếu khách hàng muốn gặp kỹ thuật viên để trao đổi trực tiếp, hệ thống ghi nhận thông tin và chuyển giao.',
    example: 'Đã tạo phiếu yêu cầu: Khách cần kỹ thuật viên gọi tư vấn lắp đặt tại Cần Thơ',
  },
];

const CS_FAQS = [
  {
    q: 'Hệ thống có tự nhận diện được khi khách hàng tức giận hoặc khiếu nại không?',
    a: 'Có. nexagnet được huấn luyện để phân loại ý định khiếu nại và cảm xúc tiêu cực. Khi phát hiện các từ khóa nhạy cảm, hệ thống sẽ lập tức chuyển quyền xử lý cho Trưởng bộ phận CSKH mà không trả lời máy móc.',
  },
  {
    q: 'Làm thế nào để đảm bảo AI không trả lời sai về chính sách bảo hành?',
    a: 'Hệ thống áp dụng cơ chế trích xuất có ràng buộc từ kho tài liệu Knowledge Base đã được duyệt. Nếu không tìm thấy thông tin trong tài liệu, hệ thống sẽ trả lời thẳng thắn là chưa có dữ liệu và ghi nhận để nhân sự phản hồi sau.',
  },
  {
    q: 'Doanh nghiệp có xem lại được lịch sử giải đáp của AI không?',
    a: 'Có. Toàn bộ lịch sử hội thoại, nguồn tài liệu được AI trích dẫn và thời gian phản hồi đều được lưu vết đầy đủ trong Nhật ký kiểm toán trên Bảng điều khiển quản trị.',
  },
];

export default function CustomerServiceSolutionPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Giải pháp', href: '/#solutions' }, { label: 'Chăm sóc Khách hàng' }]}
          eyebrow="GIẢI PHÁP / CUSTOMER SERVICE"
          badge="TIẾP NHẬN 24/7"
          title="AI Chăm sóc Khách hàng & Hỗ trợ Nhất quán"
          subtitle="Giải tỏa áp lực cho đội ngũ CSKH bằng cách tự động giải đáp các câu hỏi lặp lại 24/7 theo tài liệu duyệt và bàn giao chuyên viên mượt mà khi có khiếu nại."
          primaryCtaText="Yêu cầu Tư vấn CSKH"
          supportingPill="Giải đáp 24/7 · Trích dẫn chuẩn mực · Bàn giao chuyên viên"
        />

        <IndustryChallenges
          eyebrow="THÁCH THỨC CSKH HIỆN NAY"
          title="Những điểm nghẽn khiến khách hàng không hài lòng"
          subtitle="Tốc độ phản hồi chậm và câu trả lời thiếu nhất quán là nguyên nhân hàng đầu làm mất khách hàng trung thành."
          challenges={CS_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC HỖ TRỢ CSKH"
          title="Chăm sóc tận tâm, phản hồi trong vài giây."
          subtitle="Mang lại trải nghiệm giao tiếp chuyên nghiệp và đồng bộ trên tất cả các kênh chat của doanh nghiệp."
          features={CS_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH TIẾP NHẬN & GIẢI ĐÁP"
          title="Từ thắc mắc ban đầu đến giải pháp hoàn chỉnh."
          subtitle="Khách hàng luôn nhận được câu trả lời chính xác, hoặc được kết nối ngay với người phụ trách phù hợp."
          steps={CS_STEPS}
        />

        <ControlCallout
          title="Kiểm soát toàn diện mọi thông điệp gửi tới khách hàng."
          desc="Không có hiện tượng AI trả lời tùy tiện ngoài phạm vi cho phép. Mọi thông tin phản hồi đều được đối soát với tài liệu nội bộ đã duyệt."
        />

        <RelatedModules
          title="Các sản phẩm nexagnet liên quan"
          subtitle="Tích hợp giải pháp CSKH với hạ tầng công nghệ của nexagnet để tối ưu vận hành."
          items={[
            {
              title: 'Tri thức Nội bộ & Quy chuẩn CSKH',
              desc: 'Kho tài liệu tập trung làm nền tảng cho câu trả lời của trợ lý CSKH.',
              href: '/solutions/internal-knowledge',
            },
            {
              title: 'Giải pháp Vận hành Doanh nghiệp',
              desc: 'Tự động hóa luồng chuyển tiếp khiếu nại và công việc tới các phòng ban.',
              href: '/solutions/operations',
            },
            {
              title: 'Kiểm soát & Quản trị Nền tảng',
              desc: 'Theo dõi toàn bộ nhật ký kiểm toán và hiệu suất giải đáp CSKH.',
              href: '/platform/control',
            },
          ]}
        />

        <FAQAccordion items={CS_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
