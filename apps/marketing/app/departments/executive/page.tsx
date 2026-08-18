import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { DepartmentHero } from '@/components/departments/DepartmentHero';
import { ExecutiveHeroVisual } from '@/components/departments/DepartmentHeroVisuals';
import { DepartmentPainPoints } from '@/components/departments/DepartmentPainPoints';
import { DepartmentCapabilities } from '@/components/departments/DepartmentCapabilities';
import { DepartmentWorkflow } from '@/components/departments/DepartmentWorkflow';
import { ExecutiveControlPreview } from '@/components/home/ExecutiveControlPreview';
import { RelatedDepartments } from '@/components/departments/RelatedDepartments';
import { FAQAccordion } from '@/components/shared/FAQAccordion';
import { HomeCTA } from '@/components/home/HomeCTA';

export const metadata: Metadata = {
  title: 'AI cho Ban Giám đốc & Chủ Doanh nghiệp (Executive) | nexagnet',
  description:
    'Điều hành doanh nghiệp từ những gì cần bạn chú ý. Nexagnet giúp lọc nhiễu vận hành, gom trạng thái quy trình và quản trị các ngoại lệ cần phê duyệt cho CEO và Ban Giám đốc.',
  keywords: [
    'AI cho Ban Giám đốc',
    'AI cho CEO',
    'Điều hành doanh nghiệp bằng AI',
    'Quản trị ngoại lệ doanh nghiệp',
    'Operations Control Center',
    'Lọc nhiễu vận hành',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/departments/executive',
  },
};

const EXECUTIVE_PAIN_POINTS = [
  {
    num: '01',
    title: 'Báo cáo đến chậm và thiếu tính tức thời',
    desc: 'Số liệu kinh doanh và vận hành phải đợi tổng hợp qua nhiều bảng tính Excel thủ công, khi nhận được thì cơ hội xử lý đã trôi qua.',
    consequence: 'Ban lãnh đạo ra quyết định dựa trên dữ liệu đã cũ.',
  },
  {
    num: '02',
    title: 'Dữ liệu nằm phân mảnh ở nhiều phòng ban',
    desc: 'Sales giữ dữ liệu khách, Kho giữ số lượng tồn, Kế toán giữ công nợ. Không có một bức tranh toàn cảnh kết nối giữa các mắt xích.',
    consequence: 'Khó đánh giá được nguyên nhân gốc rễ khi quy trình bị chậm trễ.',
  },
  {
    num: '03',
    title: 'Phải liên tục hỏi nhân viên mới biết tiến độ công việc',
    desc: 'CEO và COO mất nhiều thời gian gọi điện, nhắn tin hỏi "đơn này xuất chưa?", "hồ sơ kia đã xử lý xong chưa?" vì thiếu trạng thái minh bạch.',
    consequence: 'Người quản lý bị cuốn vào vi mô thay vì tập trung chiến lược.',
  },
  {
    num: '04',
    title: 'Bất thường và sai lệch bị phát hiện quá muộn',
    desc: 'Các đơn hàng chiết khấu vượt khung, nợ quá hạn hoặc sự cố khách hàng chỉ được biết đến khi đã gây thất thoát tài chính.',
    consequence: 'Doanh nghiệp luôn ở thế bị động giải quyết hậu quả.',
  },
  {
    num: '05',
    title: 'Quyết định quan trọng nằm rải rác trong tin nhắn chat',
    desc: 'Các đề xuất phê duyệt giá đặc biệt hay duyệt chi phí diễn ra qua tin nhắn cá nhân, không có nhật ký kiểm toán và dễ bị trôi mất.',
    consequence: 'Thiếu tính minh bạch và khó quy trách nhiệm khi có tranh chấp.',
  },
  {
    num: '06',
    title: 'Khó biết hệ thống AI và tự động hóa đang làm gì',
    desc: 'Nhiều doanh nghiệp e ngại ứng dụng AI vì lo sợ AI hoạt động như chiếc "hộp đen" tự quyết định sai chính sách của công ty.',
    consequence: 'Doanh nghiệp ngần ngại chuyển đổi số hoặc mất kiểm soát quy tắc.',
  },
];

const EXECUTIVE_CAPABILITIES = [
  {
    icon: '🔍',
    title: 'Lọc nhiễu vận hành hàng ngày',
    desc: 'Hàng ngàn tin nhắn và thao tác lặp lại được xử lý tự động theo quy tắc; hệ thống chỉ lọc và đẩy lên các trường hợp thực sự cần sự can thiệp của con người.',
    bullets: ['Tự động hóa 80% tác vụ tiêu chuẩn', 'Giảm 90% thời gian đọc tin rác không cần thiết', 'Tập trung sự chú ý vào các ngoại lệ cốt lõi'],
  },
  {
    icon: '🚦',
    title: 'Giám sát điểm nghẽn quy trình liên phòng ban',
    desc: 'Hiển thị trạng thái luồng công việc theo thời gian thực: phòng ban nào đang xử lý tốt, khâu nào đang bị ứ đọng để kịp thời điều phối.',
    bullets: ['Theo dõi tiến độ đơn hàng và yêu cầu', 'Cảnh báo sớm khi quy trình vượt thời gian chuẩn', 'Minh bạch trách nhiệm của từng bộ phận'],
  },
  {
    icon: '🛡️',
    title: 'Cổng phê duyệt ngoại lệ có kiểm soát',
    desc: 'Mọi đề xuất chiết khấu lớn, đơn hàng vượt hạn mức công nợ hoặc khiếu nại nhạy cảm đều được gom hồ sơ đầy đủ để quản lý ký duyệt.',
    bullets: ['Hồ sơ đính kèm bối cảnh tin nhắn gốc', 'Phê duyệt nhanh chóng trong 1 chạm', 'Không sợ nhân viên cam kết sai chính sách'],
  },
  {
    icon: '📋',
    title: 'Nhật ký kiểm toán & Lưu vết quyết định',
    desc: 'Lưu trữ minh bạch 100% căn cứ xử lý: Từ tin nhắn đầu vào, kết quả tính toán của Rules Engine đến tài khoản người phê duyệt.',
    bullets: ['Truy xuất nguồn gốc giao dịch tức thời', 'Phục vụ thanh tra và kiểm soát nội bộ', 'Tuân thủ bảo vệ dữ liệu theo Luật 91/2025/QH15'],
  },
];

const EXECUTIVE_WORKFLOW = [
  {
    step: 'GIAI ĐOẠN 01',
    tag: 'TIẾP NHẬN & LỌC NHIỄU',
    role: 'ai' as const,
    title: 'Tiếp nhận thông tin & Phân loại ý định',
    desc: 'AI đọc hiểu các tương tác từ khách hàng và nhân viên, bóc tách thực thể và phân loại nghiệp vụ theo từ điển đóng.',
    example: 'Nhận diện: Đơn hàng đại lý · Đề xuất chiết khấu 18% (Vượt ngưỡng tự động 15%)',
  },
  {
    step: 'GIAI ĐOẠN 02',
    tag: 'ĐỐI SOÁT QUY TẮC',
    role: 'rules' as const,
    title: 'Rules Engine kiểm tra điều kiện & Phát hiện ngoại lệ',
    desc: 'Hệ thống đối soát với biểu giá và chính sách công nợ trong cơ sở dữ liệu, phát hiện giao dịch cần phê duyệt cấp cao.',
    example: 'Quy tắc: Chiết khấu > 15% bắt buộc chuyển Trưởng phòng Sales / CEO duyệt',
  },
  {
    step: 'GIAI ĐOẠN 03',
    tag: 'GOM HỒ SƠ ĐIỀU HÀNH',
    role: 'system' as const,
    title: 'Tự động tổng hợp hồ sơ vào Hàng đợi Cần Chú Ý',
    desc: 'Hệ thống trích xuất lịch sử mua hàng, công nợ hiện tại và lý do đề xuất, đưa vào hàng việc của Ban Giám đốc.',
    example: 'Tạo thẻ việc: Ngoại lệ chiết khấu NPP Duyên Hải · Công nợ hiện tại: Tốt · Giá trị đơn: 85 triệu',
  },
  {
    step: 'GIAI ĐOẠN 04',
    tag: 'PHÊ DUYỆT & THỰC THI',
    role: 'human' as const,
    title: 'Quản lý phê duyệt & Kích hoạt luồng vận hành',
    desc: 'Sau khi người quản lý duyệt, hệ thống tự động phát tin xác nhận và chuyển việc cho Kho/Kế toán thực thi.',
    example: 'CEO đã duyệt chiết khấu 18% · Ghi nhận nhật ký kiểm toán · Chuyển kho xuất hàng',
  },
];

const EXECUTIVE_FAQS = [
  {
    q: 'Giao diện điều hành này có yêu cầu doanh nghiệp phải thay thế toàn bộ phần mềm hiện có không?',
    a: 'Hoàn toàn không. Nexagnet hoạt động như một lớp AI vận hành thông minh nằm giữa các điểm tiếp xúc (Zalo, Chat, Web) và phần mềm quản trị sẵn có (KiotViet, SAP, Base, Excel). Doanh nghiệp có thể bắt đầu từng bước mà không làm đảo lộn thói quen làm việc hiện tại.',
  },
  {
    q: 'Làm thế nào để đảm bảo AI không tự ý đưa ra quyết định sai sót?',
    a: 'Nexagnet áp dụng nguyên tắc kiến trúc bất biến: AI chỉ phân loại và đọc hiểu ngữ cảnh; mọi phép tính giá, thuế, chính sách công nợ đều do Rules Engine tất định 100% thực hiện. Những trường hợp bất thường hoặc vượt hạn mức an toàn luôn yêu cầu người có thẩm quyền phê duyệt.',
  },
  {
    q: 'Dữ liệu kinh doanh nhạy cảm của chúng tôi có được bảo mật an toàn không?',
    a: 'Tuyệt đối an toàn. Dữ liệu được lưu trữ trên hạ tầng bảo mật của doanh nghiệp, tuân thủ nghiêm ngặt Luật Bảo vệ Dữ liệu Cá nhân 91/2025/QH15. Hệ thống chỉ gửi nội dung văn bản tối thiểu sang LLM để trích xuất và không chia sẻ cho bên thứ ba.',
  },
];

export default function ExecutiveDepartmentPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main>
        <DepartmentHero
          breadcrumbs={[{ label: 'Phòng ban', href: '/departments' }, { label: 'Ban Giám đốc (Executive)' }]}
          eyebrow="GÓC NHÌN ĐIỀU HÀNH / EXECUTIVE & OWNERS"
          badge="DÀNH CHO CHỦ DOANH NGHIỆP & CEO"
          title="Điều hành doanh nghiệp từ những gì cần bạn chú ý."
          subtitle="Nexagnet giúp ban lãnh đạo lọc nhiễu vận hành hàng ngày, nhìn toàn cảnh trạng thái các luồng công việc chính và tập trung đưa ra quyết định cho các ngoại lệ quan trọng."
          primaryCtaText="Trao đổi về mô hình điều hành"
          supportingPill="Lọc nhiễu vận hành · Giám sát điểm nghẽn · Cổng duyệt Human-in-the-loop"
          visual={<ExecutiveHeroVisual />}
        />

        <DepartmentPainPoints
          eyebrow="ĐIỂM NGHẼN CỦA CẤP ĐIỀU HÀNH"
          title="Tại sao việc quản lý ngày càng tốn thời gian khi doanh nghiệp lớn lên?"
          subtitle="Khi số lượng giao dịch và nhân sự tăng lên, việc thiếu một lớp dữ liệu kết nối khiến ban lãnh đạo bị cuốn vào các tiểu tiết thay vì tập trung mở rộng quy mô."
          points={EXECUTIVE_PAIN_POINTS}
        />

        {/* Conceptual Operations Control Center Showcase */}
        <section className="executive-showcase-section" aria-label="Mô hình trung tâm điều hành">
          <div className="container">
            <div className="section-header">
              <div className="section-eyebrow">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>MINH HỌA MÔ HÌNH ĐIỀU HÀNH</span>
              </div>
              <h2 className="section-headline">
                Operations Control Center: Toàn cảnh vận hành trong một giao diện.
              </h2>
              <p className="section-subheadline">
                Minh họa định hướng quản trị thông minh: Lọc sạch tương tác lặp lại, tổng hợp trạng thái các bộ phận và chỉ hiển thị danh sách các việc cần người quản lý quyết định.
              </p>
            </div>

            <ExecutiveControlPreview />
          </div>
        </section>

        <DepartmentCapabilities
          eyebrow="NĂNG LỰC HỖ TRỢ ĐIỀU HÀNH"
          title="Kiểm soát toàn diện nhưng không vi mô."
          subtitle="Trao quyền cho AI xử lý tác vụ chuẩn, giữ con người ở các chốt chặn quan trọng."
          capabilities={EXECUTIVE_CAPABILITIES}
          columns={2}
        />

        <DepartmentWorkflow
          eyebrow="LUỒNG XỬ LÝ NGOẠI LỆ ĐIỀU HÀNH"
          title="Từ sự cố phát sinh đến quyết định được chuẩn hóa."
          subtitle="Mọi ngoại lệ vượt thẩm quyền của nhân viên đều được gom hồ sơ minh bạch để quản lý phê duyệt trong tích tắc."
          steps={EXECUTIVE_WORKFLOW}
          governanceNote="Mọi hành động phê duyệt đều được lưu vết trong Nhật ký kiểm toán (Audit Trail), ghi rõ thời gian, nội dung và tài khoản người ký duyệt."
        />

        <RelatedDepartments
          title="Khám phá các phòng ban trong hệ sinh thái"
          subtitle="Xem cách các phòng ban kết nối vào lớp điều hành chung của Nexagnet."
          currentDeptSlug="executive"
        />

        <FAQAccordion items={EXECUTIVE_FAQS} />

        <HomeCTA />
      </main>
      <Footer />
    </div>
  );
}
