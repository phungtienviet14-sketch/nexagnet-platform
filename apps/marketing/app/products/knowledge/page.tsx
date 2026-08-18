import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ProductHero } from '@/components/products/ProductHero';
import { KnowledgeHeroVisual } from '@/components/products/ProductHeroVisuals';
import { FeatureGrid } from '@/components/shared/FeatureGrid';
import { WorkflowPreview } from '@/components/shared/WorkflowPreview';
import { ControlCallout } from '@/components/shared/ControlCallout';
import { RelatedModules } from '@/components/shared/RelatedModules';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'Tri thức Doanh nghiệp (Knowledge Engine) | nexagnet',
  description:
    'Hợp nhất cẩm nang sản phẩm, biểu giá, quy trình nội bộ và chính sách dịch vụ tại một Nguồn sự thật duy nhất (Source of Truth) dùng chung cho toàn bộ phòng ban trong doanh nghiệp.',
  keywords: [
    'Knowledge Engine nexagnet',
    'Tri thức Doanh nghiệp tập trung',
    'Nguồn sự thật Source of Truth',
    'Quản trị cẩm nang sản phẩm',
    'AI tra cứu tri thức nội bộ',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/products/knowledge',
  },
};

const KNOWLEDGE_FEATURES = [
  {
    icon: '🗄️',
    title: 'Một Nguồn sự thật duy nhất (Source of Truth)',
    desc: 'Bảng giá, danh mục mã SKU, quy chế chính sách và sổ tay dịch vụ được lưu trữ tập trung trong cơ sở dữ liệu (PostgreSQL/DB).',
    bullets: ['Cập nhật một nơi, toàn bộ hệ thống thấy ngay', 'Không lưu dữ liệu phân tán trên file cá nhân', 'Đồng bộ tức thời với Rules Engine và AI'],
  },
  {
    icon: '🔍',
    title: 'Tra cứu ngôn ngữ tự nhiên chuẩn xác',
    desc: 'Hỗ trợ tìm kiếm thông số kỹ thuật, chính sách bảo hành và điều khoản thương mại bằng câu hỏi tự nhiên theo từ điển đóng.',
    bullets: ['Trích dẫn chính xác theo văn bản nguồn', 'Không bịa đặt thông tin khi chưa có dữ liệu duyệt', 'Tự động ánh xạ từ viết tắt vào mã SKU chuẩn'],
  },
  {
    icon: '🏢',
    title: 'Dùng chung cho đa phòng ban trong công ty',
    desc: 'Một hạ tầng tri thức phục vụ đồng thời cho Sales (báo giá), CSKH (giải đáp bảo hành), HR (quy chế) và Vận hành (quy trình).',
    bullets: ['Phân quyền xem và sửa đổi theo từng vai trò (RBAC)', 'Bảo vệ thông tin tài chính và dữ liệu nhạy cảm', 'Tạo tính nhất quán xuyên suốt doanh nghiệp'],
  },
  {
    icon: '🛠️',
    title: 'Quản trị động qua Admin Panel & Hội thoại',
    desc: 'Nhân sự có thể dễ dàng thêm mới SKU, sửa giá đại lý, cập nhật chính sách qua giao diện trực quan hoặc qua trao đổi với AI Agent.',
    bullets: ['Giao diện Admin Panel dễ sử dụng', 'Xem trước và thẩm định trước khi xuất bản', 'Lưu nhật ký lịch sử các lần sửa đổi'],
  },
];

const KNOWLEDGE_STEPS = [
  {
    step: 'BƯỚC 01',
    tag: 'NẠP DỮ LIỆU',
    title: 'Tải tài liệu & Cấu hình Nguồn sự thật',
    desc: 'Quản trị viên nạp bảng giá, danh mục sản phẩm, chính sách bảo hành và quy chế vào hệ thống.',
    example: 'Nạp: Bảng giá đại lý Tháng 8 · Danh mục 25 mã SKU · Quy chế đổi trả 15 ngày',
  },
  {
    step: 'BƯỚC 02',
    tag: 'CHUẨN HÓA & ÁNH XẠ',
    title: 'Hệ thống cấu trúc hóa & Xây dựng Glossary',
    desc: 'Hệ thống tự động lập chỉ mục, phân loại thực thể và ánh xạ từ đồng nghĩa/viết tắt địa phương.',
    example: 'Glossary: "TN" = Thái Nguyên · "Felix" = Mã FLX-01 · "Lọc AP" = Mã AP-02',
  },
  {
    step: 'BƯỚC 03',
    tag: 'TRA CỨU LIÊN PHÒNG BAN',
    title: 'AI & Nhân sự tra cứu dữ liệu thời gian thực',
    desc: 'Mọi câu hỏi từ khách hàng hoặc nhân viên đều được đối chiếu trực tiếp từ cơ sở dữ liệu đã thẩm định.',
    example: 'Sales tra giá Cấp 1 → 1.150k · CSKH tra điều kiện đổi mới → Hợp lệ trong 15 ngày',
  },
  {
    step: 'BƯỚC 04',
    tag: 'CẬP NHẬT & HIỆU LỰC NGAY',
    title: 'Sửa đổi chính sách và có hiệu lực tức thời',
    desc: 'Khi có bảng giá mới hoặc thay đổi quy trình, quản trị viên sửa trên Admin Panel và hệ thống áp dụng ngay.',
    example: 'Đã cập nhật giá mới SKU FLX-01 · Toàn bộ luồng báo giá tự động áp dụng',
  },
];

const KNOWLEDGE_FAQS = [
  {
    q: 'Dữ liệu tri thức của doanh nghiệp có bị đem đi huấn luyện cho các model AI công cộng không?',
    a: 'Tuyệt đối không. Dữ liệu bảng giá, danh mục và quy chế nội bộ được lưu trữ riêng biệt trên hạ tầng bảo mật của doanh nghiệp. Hệ thống chỉ thực hiện tra cứu đối chiếu cục bộ và tuân thủ Luật Bảo vệ Dữ liệu Cá nhân 91/2025/QH15.',
  },
  {
    q: 'Khi có nhân viên mới, họ có thể dùng Knowledge Engine để học việc không?',
    a: 'Rất hiệu quả. Nhân viên mới có thể hỏi trực tiếp trợ lý tri thức về quy trình làm việc, thông số sản phẩm và biểu mẫu quy chế để rút ngắn thời gian làm quen công việc.',
  },
];

export default function KnowledgeProductPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <ProductHero
          moduleCode="MODULE 02"
          moduleName="Knowledge Hub"
          badge="NGUỒN SỰ THẬT DUY NHẤT"
          breadcrumbs={[{ label: 'Sản phẩm', href: '/#products' }, { label: 'Tri thức Doanh nghiệp (Knowledge)' }]}
          title="Tri thức Doanh nghiệp tập trung (Knowledge Engine)"
          subtitle="Hợp nhất cẩm nang sản phẩm, bảng giá đại lý, quy trình nội bộ và chính sách dịch vụ tại một Nguồn sự thật duy nhất (Source of Truth) phục vụ cho toàn bộ phòng ban."
          primaryCtaText="Trao đổi về Knowledge Engine"
          supportingPill="Một nguồn sự thật · Dùng chung đa phòng ban · Cập nhật động tức thời"
          visual={<KnowledgeHeroVisual />}
        />

        <FeatureGrid
          eyebrow="NĂNG LỰC CỦA KNOWLEDGE ENGINE"
          title="Xóa bỏ tình trạng thông tin phân mảnh và sai lệch."
          subtitle="Đảm bảo mọi nhân viên và hệ thống tự động hóa đều nói chung một ngôn ngữ và tuân thủ đúng chính sách của doanh nghiệp."
          features={KNOWLEDGE_FEATURES}
          columns={2}
        />

        <WorkflowPreview
          eyebrow="TIẾN TRÌNH QUẢN TRỊ TRI THỨC"
          title="Từ tài liệu thô đến tri thức vận hành chuẩn xác."
          subtitle="Quy trình nạp, chuẩn hóa và tra cứu khép kín với quyền kiểm soát tối đa của quản trị viên."
          steps={KNOWLEDGE_STEPS}
        />

        <ControlCallout
          title="Phân quyền bảo mật tri thức chặt chẽ theo vai trò (RBAC)."
          desc="Không phải ai cũng xem được toàn bộ thông tin. Bảng giá gốc và dữ liệu tài chính nhạy cảm được phân quyền nghiêm ngặt chỉ cho các cấp quản lý phù hợp."
        />

        <RelatedModules
          title="Các phòng ban ứng dụng Knowledge Engine"
          subtitle="Khám phá cách các bộ phận khai thác tri thức chung trong công việc hàng ngày."
          items={[
            {
              title: 'Phòng Bán hàng (Sales)',
              desc: 'Tra cứu bảng giá, catalogue và tồn kho khi tư vấn cho đại lý.',
              href: '/departments/sales',
            },
            {
              title: 'Chăm sóc Khách hàng (CSKH)',
              desc: 'Trích dẫn cẩm nang kỹ thuật và chính sách bảo hành chuẩn.',
              href: '/departments/customer-service',
            },
            {
              title: 'Nhân sự & Nội bộ (HR)',
              desc: 'Quản trị sổ tay nhân viên và cẩm nang quy chế doanh nghiệp.',
              href: '/departments/hr',
            },
          ]}
        />

        <FAQAccordion items={KNOWLEDGE_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
