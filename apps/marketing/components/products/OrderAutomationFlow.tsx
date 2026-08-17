'use client';

interface FlowStep {
  stepNum: string;
  tag: string;
  title: string;
  desc: string;
  example: string;
}

const FLOW_STEPS: FlowStep[] = [
  {
    stepNum: '01',
    tag: 'TIẾP NHẬN HỘI THOẠI',
    title: 'Đọc tin nhắn từ nhóm Zalo & kênh trao đổi',
    desc: 'Hệ thống tự động tiếp nhận tin nhắn từ các nhóm đối tác, đại lý hoặc tin nhắn trực tiếp với cơ chế kết nối linh hoạt.',
    example: '“Cho chị 10 quạt Felix về kho Thái Nguyên, thanh toán công nợ như cũ nha em”',
  },
  {
    stepNum: '02',
    tag: 'AI TRÍCH XUẤT CÓ RÀNG BUỘC',
    title: 'Bóc tách thực thể theo JSON Schema đóng',
    desc: 'Mô hình AI ánh xạ các từ viết tắt, tiếng lóng vào danh mục sản phẩm và hồ sơ đối tác chuẩn trong Nguồn sự thật.',
    example: 'Đại lý: NPP Miền Bắc · SKU: FLX-01 · Số lượng: 10 cái · Kho nhận: Kho TN',
  },
  {
    stepNum: '03',
    tag: 'RULES ENGINE TẤT ĐỊNH',
    title: 'Đối soát biểu giá, thuế VAT & chính sách đối tác',
    desc: 'Code TypeScript độc lập tính toán chính xác tiền hàng, thuế VAT, chiết khấu và đối soát hạn mức công nợ theo chính sách đã cấu hình.',
    example: 'Đơn giá: 1.150.000đ · Thành tiền: 11.500.000đ · Chính sách công nợ: Hợp lệ',
  },
  {
    stepNum: '04',
    tag: 'PHÂN LUỒNG & THỰC THI',
    title: 'Gửi xác nhận tự động hoặc chuyển Sales duyệt',
    desc: 'Đơn hợp lệ trong ngưỡng an toàn tự động gửi xác nhận nhóm và chuyển hàng việc Sales; đơn lớn hoặc ngoại lệ chuyển Sales duyệt trước khi gửi.',
    example: 'Đã phát tin xác nhận vào nhóm Zalo · Ghi nhận vào hàng việc Sales nhận đơn',
  },
];

export function OrderAutomationFlow() {
  return (
    <section className="order-flow-section" id="flow" aria-label="Luồng xử lý giải pháp Order Automation">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>QUY TRÌNH VẬN HÀNH 4 BƯỚC</span>
          </div>

          <h2 className="section-headline">
            Từ tin nhắn gõ vội
            <br />
            đến đơn hàng chuẩn xác, sẵn sàng xử lý.
          </h2>

          <p className="section-subheadline">
            Luồng xử lý khép kín và tất định, đảm bảo mọi đơn hàng đều được đối soát kỹ lưỡng qua các tầng an toàn trước khi gửi ra bên ngoài.
          </p>
        </div>

        <div className="flow-steps-grid">
          {FLOW_STEPS.map((step) => (
            <div key={step.stepNum} className="flow-step-card">
              <div className="step-card-header">
                <span className="step-num">{step.stepNum}</span>
                <span className="step-tag">{step.tag}</span>
              </div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-desc">{step.desc}</p>
              <div className="step-example-box">
                <span className="ex-label">DỮ LIỆU THỰC THI:</span>
                <p className="ex-content">{step.example}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
