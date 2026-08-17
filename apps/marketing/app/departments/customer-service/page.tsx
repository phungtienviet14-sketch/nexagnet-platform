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
  title: 'AI cho Phòng Chăm sóc Khách hàng (CSKH) | nexagnet',
  description:
    'Xử lý yêu cầu nhất quán và chuyển đúng ngoại lệ cho nhân viên. Nexagnet hỗ trợ tiếp nhận 24/7 theo tài liệu duyệt, giảm tải câu hỏi lặp lại và gom hồ sơ khiếu nại.',
  keywords: [
    'AI cho phòng Chăm sóc Khách hàng',
    'AI CSKH doanh nghiệp',
    'Tự động hóa phản hồi khách hàng',
    'Phân luồng khiếu nại thông minh',
    'Trợ lý ảo CSKH có kiểm soát',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments/customer-service',
  },
};

const CS_PAIN_POINTS = [
  {
    num: '01',
    title: 'Khối lượng câu hỏi lặp lại quá lớn',
    desc: 'Hàng trăm tin nhắn mỗi ngày hỏi cùng một vấn đề: giờ mở cửa, cách sử dụng, chính sách đổi trả, tra cứu trạng thái đơn khiến đội ngũ CSKH kiệt sức.',
    consequence: 'Nhân sự không còn thời gian để xử lý các sự cố phức tạp.',
  },
  {
    num: '02',
    title: 'Kiến thức phân tán, câu trả lời không đồng nhất',
    desc: 'Mỗi nhân viên tư vấn một kiểu khác nhau do chính sách bảo hành và hướng dẫn kỹ thuật lưu rải rác trên nhiều file và tin nhắn cũ.',
    consequence: 'Khách hàng nhận thông tin sai lệch, gây thất vọng và khiếu nại leo thang.',
  },
  {
    num: '03',
    title: 'Vấn đề phức tạp bị chuyển sai người hoặc bị quên',
    desc: 'Khi có khiếu nại kỹ thuật hoặc đổi trả, nhân viên chuyển tiếp thủ công qua chat nội bộ, không có người chịu trách nhiệm rõ ràng.',
    consequence: 'Sự cố kéo dài nhiều ngày, làm suy giảm uy tín thương hiệu.',
  },
  {
    num: '04',
    title: 'Khách hàng ngoài giờ hành chính phải chờ đợi lâu',
    desc: 'Phần lớn nhu cầu tra cứu và hỏi thông tin diễn ra vào buổi tối hoặc cuối tuần khi không có nhân sự trực ca.',
    consequence: 'Khách hàng cảm thấy không được quan tâm và dễ đánh giá tiêu cực.',
  },
  {
    num: '05',
    title: 'Lịch sử tương tác bị mất dấu khi đổi ca',
    desc: 'Nhân sự ca sau không nắm được ca trước đã trao đổi và cam kết những gì với khách hàng, phải hỏi lại từ đầu.',
    consequence: 'Gây phiền toái cho khách hàng và giảm tính chuyên nghiệp.',
  },
];

const CS_CAPABILITIES = [
  {
    icon: '💬',
    title: 'Phản hồi nhất quán 24/7 theo tài liệu duyệt',
    desc: 'AI trả lời chính xác các câu hỏi thường gặp dựa trên cẩm nang sản phẩm, chính sách bảo hành đã được doanh nghiệp thẩm định.',
    bullets: ['Trích dẫn chuẩn xác theo tài liệu nguồn', 'Văn phong chuyên nghiệp, chuẩn mực', 'Tuyệt đối không bịa đặt thông tin khi chưa có nguồn'],
  },
  {
    icon: '🔍',
    title: 'Tra cứu thông tin & Hỗ trợ bóc tách sự cố',
    desc: 'Hệ thống tự động khai thác đầy đủ các thông tin cần thiết: Mã sản phẩm, hiện tượng lỗi, ảnh chụp chứng từ để làm rõ yêu cầu.',
    bullets: ['Thu thập đầy đủ thông tin trước khi chuyển người', 'Phân loại mức độ khẩn cấp của khiếu nại', 'Hỗ trợ đính kèm hình ảnh và video mô tả'],
  },
  {
    icon: '🚀',
    title: 'Chuyển giao chuyên viên & Gom hồ sơ ngoại lệ',
    desc: 'Với các tình huống vượt chính sách hoặc cần chuyên môn sâu, hệ thống tự động gom toàn bộ ngữ cảnh và tạo thẻ việc cho chuyên viên.',
    bullets: ['Chuyển giao mượt mà không bắt khách lặp lại', 'Thông báo tức thì cho chuyên viên phụ trách', 'Gắn nhãn thời hạn xử lý (SLA) rõ ràng'],
  },
  {
    icon: '📊',
    title: 'Lưu vết lịch sử tương tác toàn diện',
    desc: 'Hợp nhất toàn bộ lịch sử trao đổi qua các kênh vào một hồ sơ khách hàng duy nhất để toàn bộ đội ngũ nắm bắt.',
    bullets: ['Dễ dàng bàn giao giữa các ca trực', 'Lưu nhật ký phục vụ đánh giá chất lượng', 'Bảo vệ dữ liệu khách hàng theo pháp luật'],
  },
];

const CS_WORKFLOW = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN YÊU CẦU',
    role: 'ai' as const,
    title: 'Khách hàng gửi câu hỏi hoặc phản ánh sự cố',
    desc: 'Khách hàng nhắn tin qua Zalo, Messenger hoặc Web chat vào bất kỳ thời điểm nào trong ngày.',
    example: '“Máy hút bụi bên em mới mua được 10 ngày tự nhiên không sạc được, có đổi mới được không?”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'ĐỌC HIỂU & ĐỐI SOÁT',
    role: 'rules' as const,
    title: 'AI hiểu ý định & Rules Engine đối soát chính sách',
    desc: 'Hệ thống nhận diện ý định đổi trả bảo hành, kiểm tra quy chế: Đổi mới 1-1 trong vòng 15 ngày đầu đối với lỗi nguồn.',
    example: 'Thời gian mua: 10 ngày (Hợp lệ ≤ 15 ngày) · Loại lỗi: Lỗi nguồn sạc',
  },
  {
    step: 'BƯỚC 03',
    tag: 'HỖ TRỢ & GOM HỒ SƠ',
    role: 'ai' as const,
    title: 'AI hướng dẫn gửi video & Gom hồ sơ kỹ thuật',
    desc: 'AI gửi tin nhắn lịch sự hướng dẫn khách quay video ngắn và cung cấp địa chỉ để nhân viên hỗ trợ đổi hàng.',
    example: '“Dạ sản phẩm trong 15 ngày đầu được hỗ trợ đổi mới 1-1. Anh/chị gửi giúp em video quay hiện tượng máy để kỹ thuật hỗ trợ ngay ạ.”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'BÀN GIAO CHUYÊN VIÊN',
    role: 'human' as const,
    title: 'Chuyển phiếu xử lý đổi hàng cho Bộ phận Bảo hành',
    desc: 'Hệ thống tạo phiếu trên Hàng việc để Chuyên viên kỹ thuật liên hệ gửi sản phẩm mới cho khách hàng.',
    example: 'Đã tạo phiếu: Đổi mới máy hút bụi FLX-01 · Khách: Anh Nam - 0988*** · SLA xử lý: 30 phút',
  },
];

const CS_FAQS = [
  {
    q: 'Nexagnet có khác gì so với một chatbot trả lời tự động thông thường?',
    a: 'Chatbot thông thường chỉ trả lời theo kịch bản cứng nhắc hoặc sinh chữ tự do dễ bịa đặt. Nexagnet kết hợp AI đọc hiểu với Rules Engine đối soát chính sách thực tế từ cơ sở dữ liệu. Khi có sự cố phức tạp, hệ thống tự động gom hồ sơ và chuyển giao cho đúng chuyên viên xử lý mà không bỏ lửng khách hàng.',
  },
  {
    q: 'Khi khách hàng có câu hỏi mà hệ thống chưa có dữ liệu thì sao?',
    a: 'Hệ thống được lập trình trung thực: Tuyệt đối không tự suy đoán thông tin. AI sẽ lịch sự thông báo và chuyển ngay câu hỏi vào Hàng việc của nhân viên CSKH để giải đáp trực tiếp.',
  },
];

export default function CustomerServiceDepartmentPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <DepartmentHero
          breadcrumbs={[{ label: 'Phòng ban', href: '/departments' }, { label: 'Chăm sóc Khách hàng (CSKH)' }]}
          eyebrow="ỨNG DỤNG PHÒNG BAN / CUSTOMER SERVICE & SUPPORT"
          badge="CHĂM SÓC KHÁCH HÀNG 24/7"
          title="Xử lý yêu cầu nhất quán và chuyển đúng ngoại lệ cho nhân viên."
          subtitle="Hệ thống hỗ trợ tiếp nhận đa kênh, giải đáp câu hỏi chuẩn theo tài liệu duyệt và tự động gom hồ sơ chuyển giao các trường hợp phức tạp cho chuyên viên."
          primaryCtaText="Trao đổi về giải pháp CSKH"
          supportingPill="Giải đáp 24/7 · Trích dẫn chuẩn xác · Gom hồ sơ ngoại lệ"
        />

        <DepartmentPainPoints
          eyebrow="ĐIỂM NGHẼN PHÒNG CSKH"
          title="Tại sao đội ngũ CSKH dễ bị quá tải và giảm sút chất lượng?"
          subtitle="Khi số lượng tương tác tăng cao mà thiếu công cụ phân luồng thông minh, nhân sự sẽ bị kẹt trong các câu hỏi lặp lại và bỏ quên khách hàng gặp sự cố."
          points={CS_PAIN_POINTS}
        />

        <DepartmentCapabilities
          eyebrow="NĂNG LỰC HỖ TRỢ CSKH"
          title="Tự động hóa thông minh, nâng cao sự hài lòng."
          subtitle="Giải phóng nhân viên khỏi tác vụ lặp lại để tập trung chăm sóc khách hàng chuyên sâu."
          capabilities={CS_CAPABILITIES}
          columns={2}
        />

        <DepartmentWorkflow
          eyebrow="LUỒNG XỬ LÝ YÊU CẦU CSKH"
          title="Từ tin nhắn phản ánh đến giải pháp được giải quyết dứt điểm."
          subtitle="Quy trình minh bạch kết hợp giữa AI hỗ trợ bước đầu và chuyên viên giải quyết sự cố."
          steps={CS_WORKFLOW}
          governanceNote="Toàn bộ nội dung tư vấn đều được trích lục từ Nguồn sự thật đã được duyệt. Mọi cam kết đổi trả hoặc đền bù tài chính đều do chuyên viên nhân sự xác nhận."
        />

        <RelatedModules
          title="Các sản phẩm Nexagnet liên quan"
          subtitle="Khám phá các module công nghệ hỗ trợ nâng cao trải nghiệm khách hàng."
          items={[
            {
              title: 'Tri thức Doanh nghiệp (Knowledge)',
              desc: 'Hợp nhất cẩm nang sản phẩm và sổ tay xử lý sự cố chuẩn.',
              href: '/products/knowledge',
              badge: 'Tiêu biểu',
            },
            {
              title: 'Phòng Vận hành (Operations)',
              desc: 'Phối hợp với bộ phận kho vận để xử lý đổi trả và giao hàng bổ sung.',
              href: '/departments/operations',
            },
            {
              title: 'Điều phối Chiến dịch (Campaigns)',
              desc: 'Gửi tin nhắn chăm sóc và hướng dẫn sử dụng sau mua hàng.',
              href: '/products/campaigns',
            },
          ]}
        />

        <RelatedDepartments
          title="Khám phá các phòng ban liên quan"
          subtitle="Xem cách phòng CSKH kết nối với Sales, Vận hành và Ban Giám đốc."
          currentDeptSlug="customer-service"
        />

        <FAQAccordion items={CS_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
