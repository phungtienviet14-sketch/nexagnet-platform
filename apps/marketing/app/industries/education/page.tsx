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
  title: 'AI cho Tổ chức Giáo dục & Tuyển sinh | nexagnet',
  description:
    'nexagnet có thể hỗ trợ các trường học, học viện và trung tâm đào tạo giải đáp thắc mắc tuyển sinh, tư vấn lộ trình học và thu thập thông tin học viên tiềm năng 24/7.',
  alternates: {
    canonical: 'https://nexagnet247.com/industries/education',
  },
};

const EDU_CHALLENGES = [
  {
    num: '01',
    title: 'Quá tải câu hỏi mùa tuyển sinh',
    desc: 'Mỗi đợt tuyển sinh, hàng nghìn phụ huynh và học viên nhắn tin hỏi về học phí, điểm chuẩn, điều kiện xét tuyển và lịch khai giảng khiến ban tuyển sinh không kịp trả lời.',
  },
  {
    num: '02',
    title: 'Tư vấn lộ trình học không đồng đều',
    desc: 'Cộng tác viên hoặc tư vấn viên mới vào nghề thường chưa nắm rõ toàn bộ chương trình đào tạo, dẫn đến việc tư vấn sai ca học hoặc điều kiện tốt nghiệp.',
  },
  {
    num: '03',
    title: 'Học viên nhắn tin ban đêm và cuối tuần không được hỗ trợ',
    desc: 'Thời điểm học viên rảnh để tìm hiểu khóa học thường vào buổi tối. Việc phản hồi chậm sau 1–2 ngày khiến tỷ lệ đăng ký nhập học giảm sút rõ rệt.',
  },
];

const EDU_CAPABILITIES = [
  {
    icon: '🎓',
    title: 'Giải đáp thông tin tuyển sinh & Học phí chuẩn xác',
    desc: 'Tự động giải đáp các câu hỏi về chỉ tiêu xét tuyển, khung học phí, học bổng và lịch học dựa trên đề án tuyển sinh chính thức.',
    bullets: ['Cung cấp thông tin học phí và chính sách học bổng', 'Giải thích điều kiện xét tuyển và hồ sơ cần chuẩn bị', 'Trích dẫn chính xác đề án tuyển sinh đã duyệt'],
  },
  {
    icon: '📝',
    title: 'Tư vấn lộ trình & Thu thập thông tin đăng ký',
    desc: 'Khảo sát trình độ hiện tại, mục tiêu học tập của học viên để gợi ý khóa học phù hợp và ghi nhận thông tin liên hệ.',
    bullets: ['Khảo sát trình độ và nguyện vọng của học viên', 'Thu thập thông tin số điện thoại và email', 'Tạo hồ sơ đăng ký tư vấn tuyển sinh'],
  },
  {
    icon: '👩‍🏫',
    title: 'Chuyển giao tư vấn viên chuyên trách',
    desc: 'Bàn giao các trường hợp học viên có nhu cầu nhập học ngay hoặc cần tư vấn lộ trình du học/chứng chỉ sang tư vấn viên phụ trách.',
    bullets: ['Phân bổ học viên theo ngành/khóa học quan tâm', 'Gửi kèm toàn bộ lịch sử tư vấn sơ bộ', 'Giúp tư vấn viên chuẩn bị sẵn phương án trước khi gọi'],
  },
];

const EDU_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'TIẾP NHẬN THẮC MẮC',
    title: 'Phụ huynh / Học viên nhắn tin tìm hiểu',
    desc: 'Học viên gửi câu hỏi về khóa học tiếng Anh giao tiếp hoặc chương trình cử nhân qua Fanpage/Zalo.',
    example: '“Cho mình hỏi khóa luyện thi IELTS 6.5 học phí bao nhiêu và có lớp học buổi tối không?”',
  },
  {
    step: 'BƯỚC 02',
    tag: 'TRUY VẤN ĐỀ ÁN',
    title: 'Đối chiếu thông tin khóa học trong Nguồn sự thật',
    desc: 'AI tìm kiếm thời lượng, học phí và lịch khai giảng gần nhất trong tài liệu đào tạo đã duyệt.',
    example: 'Khóa học: IELTS Intensive Target 6.5 · Thời lượng: 3 tháng · Lịch học: Tối 2-4-6 · Học phí: 8.500.000đ',
  },
  {
    step: 'BƯỚC 03',
    tag: 'TƯ VẤN & GỢI Ý',
    title: 'Giải đáp chi tiết & Mời làm bài kiểm tra đầu vào',
    desc: 'AI trả lời rõ ràng về lịch học, học phí và gợi ý học viên làm bài test trình độ miễn phí.',
    example: '“Dạ khóa IELTS 6.5 khai giảng vào ngày 15 tới, học tối 2-4-6 từ 18:30. Bạn đã từng thi thử hoặc test trình độ hiện tại chưa ạ?”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'BÀN GIAO TƯ VẤN VIÊN',
    title: 'Chuyển thông tin cho Ban Tuyển sinh',
    desc: 'Hệ thống tạo phiếu đăng ký để chuyên viên tuyển sinh liên hệ hỗ trợ xếp lớp và gửi đề test.',
    example: 'Đã tạo phiếu: Bạn Lan (0988.xxx) đăng ký test đầu vào khóa IELTS 6.5 tối 2-4-6',
  },
];

const EDU_FAQS = [
  {
    q: 'Hệ thống có thể hỗ trợ nhiều cơ sở đào tạo và nhiều ngành học cùng lúc không?',
    a: 'Có. nexagnet hỗ trợ phân chia kho tri thức theo từng cơ sở, từng viện/khoa đào tạo và từng khóa học riêng biệt, đảm bảo tư vấn chuẩn xác theo đúng địa điểm học.',
  },
  {
    q: 'Làm thế nào để cập nhật lịch khai giảng và học phí mới?',
    a: 'Ban Tuyển sinh chỉ cần cập nhật biểu thông tin trên Bảng quản trị hoặc tải tài liệu tuyển sinh mới lên. Hệ thống sẽ tự động áp dụng thông tin mới ngay lập tức.',
  },
  {
    q: 'Học viên đăng ký thông tin có được chuyển vào phần mềm CRM quản trị của trường không?',
    a: 'Có. nexagnet hỗ trợ đẩy dữ liệu học viên (Họ tên, SĐT, Email, Khóa học quan tâm, Lịch sử chat) sang hệ thống CRM hoặc Google Sheets của trường theo thời gian thực.',
  },
];

export default function EducationIndustryPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Ngành', href: '/#industries' }, { label: 'Giáo dục & Đào tạo' }]}
          eyebrow="ỨNG DỤNG NGÀNH / EDUCATION & ADMISSIONS"
          badge="TUYỂN SINH & ĐÀO TẠO"
          title="AI cho Tổ chức Giáo dục & Tuyển sinh"
          subtitle="nexagnet có thể hỗ trợ các trường học, học viện và trung tâm đào tạo giải đáp thắc mắc tuyển sinh, tư vấn lộ trình học và thu thập thông tin học viên tiềm năng 24/7."
          primaryCtaText="Yêu cầu Tư vấn Giải pháp Giáo dục"
          supportingPill="Giải đáp tuyển sinh 24/7 · Tư vấn lộ trình · Kết nối ban tuyển sinh"
        />

        <IndustryChallenges
          eyebrow="BÀI TOÁN TUYỂN SINH THỰC TẾ"
          title="Những điểm nghẽn trong mùa tuyển sinh cao điểm"
          subtitle="Hàng nghìn thắc mắc của thí sinh cần được giải đáp nhanh chóng, chính xác để giữ chân học viên tiềm năng."
          challenges={EDU_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CẤU HÌNH CHO GIÁO DỤC"
          title="Đồng hành cùng học viên, tối ưu hóa tuyển sinh."
          subtitle="Giải tỏa áp lực cho ban tuyển sinh trong các đợt cao điểm và nâng cao tỷ lệ chuyển đổi nhập học."
          features={EDU_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH TƯ VẤN & XẾP LỚP"
          title="Từ câu hỏi tuyển sinh đến hồ sơ nhập học hoàn tất."
          subtitle="Học viên nhận được thông tin chuẩn xác và được kết nối ngay với tư vấn viên phụ trách."
          steps={EDU_STEPS}
        />

        <ControlCallout
          title="Thông tin tuyển sinh minh bạch, đúng quy chế đào tạo."
          desc="nexagnet chỉ cung cấp các thông tin dựa trên đề án tuyển sinh và quy chế đào tạo chính thức của nhà trường, loại bỏ hoàn toàn các cam kết sai lệch."
        />

        <RelatedModules
          title="Các sản phẩm liên quan"
          subtitle="Khám phá các module nexagnet hỗ trợ đắc lực cho hoạt động đào tạo."
          items={[
            {
              title: 'Giải pháp Chăm sóc Khách hàng & Học viên',
              desc: 'Hỗ trợ sinh viên và học viên giải đáp các thủ tục đào tạo 24/7.',
              href: '/solutions/customer-service',
            },
            {
              title: 'Tri thức Nội bộ & Quy chế Đào tạo',
              desc: 'Quản trị tập trung đề án tuyển sinh, khung chương trình và quy chế nhà trường.',
              href: '/solutions/internal-knowledge',
            },
            {
              title: 'Kiểm soát & Quản trị AI',
              desc: 'Đảm bảo nội dung tư vấn hướng nghiệp tuân thủ đúng đề án tuyển sinh chuẩn.',
              href: '/platform/control',
            },
          ]}
        />

        <FAQAccordion items={EDU_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
