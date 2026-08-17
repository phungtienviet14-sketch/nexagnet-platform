'use client';

interface ProcessStep {
  step: string;
  title: string;
  desc: string;
  timeframe: string;
}

const PROCESS_STEPS: ProcessStep[] = [
  {
    step: 'GIAI ĐOẠN 01',
    title: 'Khảo sát & Nạp nguồn sự thật',
    desc: 'Chuẩn hóa danh mục SKU, biểu giá theo cấp đối tác, chính sách công nợ và từ điển viết tắt vào cơ sở dữ liệu.',
    timeframe: 'Giai đoạn 1',
  },
  {
    step: 'GIAI ĐOẠN 02',
    title: 'Kết nối nhóm Zalo & Kênh tiếp nhận',
    desc: 'Thiết lập kết nối an toàn với các nhóm Zalo đối tác hoặc cơ chế Co-pilot mà không làm gián đoạn trao đổi hàng ngày.',
    timeframe: 'Giai đoạn 2',
  },
  {
    step: 'GIAI ĐOẠN 03',
    title: 'Chạy thử nghiệm Co-pilot (Sales duyệt 100%)',
    desc: 'AI trích xuất và đối soát đơn nháp, đội ngũ Sales trực tiếp kiểm tra và xác nhận để tối ưu từ điển theo thực tế.',
    timeframe: 'Giai đoạn 3',
  },
  {
    step: 'GIAI ĐOẠN 04',
    title: 'Kích hoạt tự động hóa theo ngưỡng an toàn',
    desc: 'Đơn hợp lệ trong ngưỡng tự động gửi xác nhận ngay; Sales nhận việc chuẩn hóa để xử lý xuất hàng nhanh chóng.',
    timeframe: 'Vận hành chuẩn',
  },
];

export function OrderAutomationProcess() {
  return (
    <section className="order-process-section" id="process" aria-label="Quy trình triển khai">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>LỘ TRÌNH TRIỂN KHAI TỪNG BƯỚC</span>
          </div>

          <h2 className="section-headline">
            Đưa vào vận hành thực tế
            <br />
            theo lộ trình có kiểm soát &amp; an toàn.
          </h2>

          <p className="section-subheadline">
            Không cần đội ngũ IT nội bộ phức tạp. nexagnet cung cấp quy trình triển khai rõ ràng, từng bước chuyển giao và đồng hành cùng đội ngũ kinh doanh của bạn.
          </p>
        </div>

        <div className="process-timeline-grid">
          {PROCESS_STEPS.map((ps) => (
            <div key={ps.step} className="process-step-card">
              <div className="p-step-top">
                <span className="p-step-num">{ps.step}</span>
                <span className="p-timeframe">{ps.timeframe}</span>
              </div>
              <h3 className="p-step-title">{ps.title}</h3>
              <p className="p-step-desc">{ps.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
