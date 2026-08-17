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
  title: 'AI Quản trị Tri thức Nội bộ Doanh nghiệp | nexagnet',
  description:
    'Hợp nhất toàn bộ quy trình, biểu mẫu, chính sách nhân sự và sổ tay vận hành tại một nơi duy nhất để nhân viên tra cứu chính xác tức thì.',
  alternates: {
    canonical: 'https://nexagnet247.com/solutions/internal-knowledge',
  },
};

const IK_CHALLENGES = [
  {
    num: '01',
    title: 'Tài liệu và quy trình phân tán nhiều nơi',
    desc: 'Quy chế công ty, biểu mẫu tạm ứng, chính sách bán hàng nằm rải rác trên Google Drive, Zalo chat và máy tính cá nhân khiến nhân sự mất thời gian tìm kiếm.',
  },
  {
    num: '02',
    title: 'Nhân sự mới mất nhiều tuần để làm quen',
    desc: 'Việc đào tạo nhân viên mới phụ thuộc hoàn toàn vào người hướng dẫn trực tiếp, gây gián đoạn công việc của các nhân sự kỳ cựu.',
  },
  {
    num: '03',
    title: 'Không kiểm soát được phiên bản tài liệu mới nhất',
    desc: 'Khi có chính sách hoa hồng hoặc quy trình công tác mới, nhân viên vẫn dùng bản cũ do không biết tài liệu đã được cập nhật.',
  },
];

const IK_CAPABILITIES = [
  {
    icon: '🏢',
    title: 'Trợ lý ảo nội bộ giải đáp quy chế 24/7',
    desc: 'Nhân viên có thể hỏi trực tiếp trợ lý AI về mọi thủ tục hành chính, chế độ nghỉ phép, quy trình thanh toán và nhận câu trả lời kèm trích dẫn văn bản.',
    bullets: ['Tra cứu quy định nhân sự & hành chính', 'Tìm kiếm biểu mẫu và hướng dẫn điền đơn', 'Trích dẫn chính xác điều khoản trong sổ tay'],
  },
  {
    icon: '📑',
    title: 'Một Nguồn sự thật cho toàn công ty',
    desc: 'Hợp nhất mọi quy định vào kho tri thức tập trung. Khi có thay đổi, chỉ cần cập nhật văn bản gốc là toàn bộ nhân sự đều nhận được thông tin mới nhất.',
    bullets: ['Đồng bộ hóa phiên bản tài liệu tức thì', 'Quản trị phân quyền theo từng phòng ban', 'Không lo tài liệu bị thất lạc'],
  },
  {
    icon: '🔒',
    title: 'Phân quyền bảo mật theo vai trò (RBAC)',
    desc: 'Kiểm soát chặt chẽ quyền tra cứu thông tin: Nhân viên chỉ xem được tài liệu thuộc phạm vi phòng ban và cấp bậc được phép truy cập.',
    bullets: ['Tách biệt dữ liệu nhạy cảm theo phòng ban', 'Lưu vết lịch sử tra cứu của từng tài khoản', 'Bảo vệ bí mật kinh doanh an toàn'],
  },
];

const IK_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'NẠP TÀI LIỆU',
    title: 'Tập hợp quy trình & Sổ tay công ty',
    desc: 'Tải lên các tài liệu quy chế, biểu mẫu, quy trình bàn giao và chính sách nội bộ lên hệ thống.',
    example: 'Tài liệu: Quy chế Công tác phí 2026 · Sổ tay Nhân sự · Quy trình Thanh toán',
  },
  {
    step: 'BƯỚC 02',
    tag: 'PHÂN QUYỀN TRUY CẬP',
    title: 'Thiết lập vai trò & Phòng ban',
    desc: 'Gán quyền truy cập tài liệu tương ứng cho từng nhóm nhân sự (Sales, Kế toán, Nhân sự, Quản lý).',
    example: 'Nhóm Kinh doanh: Xem biểu mẫu chiết khấu & chính sách bán hàng',
  },
  {
    step: 'BƯỚC 03',
    tag: 'TRA CỨU HỘI THOẠI',
    title: 'Nhân viên đặt câu hỏi bằng ngôn ngữ tự nhiên',
    desc: 'Nhân sự gửi câu hỏi qua chat nội bộ và nhận câu trả lời có trích dẫn văn bản chính thức.',
    example: '“Hạn mức công tác phí khách sạn ở Đà Nẵng cho chuyên viên là bao nhiêu?”',
  },
  {
    step: 'BƯỚC 04',
    tag: 'TRẢ LỜI CÓ CĂN CỨ',
    title: 'AI giải đáp kèm đường dẫn văn bản',
    desc: 'Hệ thống trích xuất nội dung chuẩn xác kèm đường dẫn biểu mẫu để nhân viên tải về sử dụng ngay.',
    example: '“Hạn mức là 800.000đ/đêm (Mục 4.1 Quy chế Công tác phí 2026). Tải biểu mẫu thanh toán tại đây.”',
  },
];

const IK_FAQS = [
  {
    q: 'Dữ liệu nội bộ của công ty có bị rò rỉ ra bên ngoài không?',
    a: 'Hoàn toàn không. nexagnet lưu trữ toàn bộ dữ liệu trên hạ tầng bảo mật của doanh nghiệp và tuân thủ nghiêm ngặt Luật Bảo vệ Dữ liệu cá nhân (91/2025/QH15). Dữ liệu không bao giờ được chia sẻ cho bên thứ ba.',
  },
  {
    q: 'Hệ thống có hỗ trợ phân quyền để nhân viên không xem được tài liệu của sếp không?',
    a: 'Có. Hệ thống tích hợp sẵn cơ chế phân quyền theo vai trò (Role-Based Access Control - RBAC), đảm bảo nhân viên chỉ tra cứu được các tài liệu được cấp phép cho phòng ban và chức danh của mình.',
  },
  {
    q: 'Cập nhật tài liệu mới có phức tạp không?',
    a: 'Rất đơn giản. Trưởng bộ phận hoặc Admin chỉ cần tải tệp tài liệu mới lên Bảng quản trị. Hệ thống sẽ tự động lập chỉ mục và áp dụng vào câu trả lời của AI trong vài giây.',
  },
];

export default function InternalKnowledgeSolutionPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <PageHero
          breadcrumbs={[{ label: 'Giải pháp', href: '/#solutions' }, { label: 'Tri thức Nội bộ' }]}
          eyebrow="GIẢI PHÁP / INTERNAL KNOWLEDGE"
          badge="BẢO MẬT & PHÂN QUYỀN"
          title="AI Quản trị Tri thức & Quy trình Nội bộ"
          subtitle="Hợp nhất toàn bộ quy trình, biểu mẫu, chính sách nhân sự và sổ tay vận hành tại một nơi duy nhất để nhân viên tra cứu chính xác tức thì."
          primaryCtaText="Yêu cầu Tư vấn Tri thức Nội bộ"
          supportingPill="Một Nguồn sự thật · Phân quyền RBAC · Tra cứu tức thì"
        />

        <IndustryChallenges
          eyebrow="THÁCH THỨC VẬN HÀNH NỘI BỘ"
          title="Những lãng phí vô hình khi tri thức doanh nghiệp bị phân tán"
          subtitle="Mỗi ngày, nhân viên mất từ 30–60 phút chỉ để tìm kiếm tài liệu hoặc hỏi đi hỏi lại các thủ tục hành chính quen thuộc."
          challenges={IK_CHALLENGES}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC TRI THỨC NỘI BỘ"
          title="Thông tin chuẩn xác, trao quyền cho nhân sự."
          subtitle="Giúp mọi thành viên trong công ty tự tin nắm vững quy trình và phối hợp công việc hiệu quả hơn."
          features={IK_CAPABILITIES}
        />

        <WorkflowPreview
          eyebrow="QUY TRÌNH TRA CỨU TRI THỨC"
          title="Từ câu hỏi nội bộ đến câu trả lời có trích dẫn văn bản."
          subtitle="Nhân viên luôn nhận được câu trả lời chính thức, đúng quy chế và có thể tải ngay biểu mẫu cần thiết."
          steps={IK_STEPS}
        />

        <ControlCallout
          title="Bảo mật tuyệt đối thông tin nội bộ của doanh nghiệp."
          desc="nexagnet áp dụng kiến trúc mã hóa đa tầng và phân quyền chặt chẽ theo phòng ban, đảm bảo không xảy ra rò rỉ dữ liệu quan trọng."
        />

        <RelatedModules
          title="Các giải pháp liên quan"
          subtitle="Mở rộng ứng dụng tri thức AI sang các hoạt động bán hàng và chăm sóc khách hàng."
          items={[
            {
              title: 'Kiểm soát & Quản trị AI',
              desc: 'Cơ chế phân quyền tri thức theo phòng ban và bảo vệ bí mật kinh doanh.',
              href: '/platform/control',
            },
            {
              title: 'Giải pháp Chăm sóc Khách hàng',
              desc: 'Ứng dụng tri thức sản phẩm để phục vụ khách hàng bên ngoài.',
              href: '/solutions/customer-service',
            },
            {
              title: 'Giải pháp Vận hành Doanh nghiệp',
              desc: 'Tự động hóa các quy trình phê duyệt và luồng công việc nội bộ.',
              href: '/solutions/operations',
            },
          ]}
        />

        <FAQAccordion items={IK_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
