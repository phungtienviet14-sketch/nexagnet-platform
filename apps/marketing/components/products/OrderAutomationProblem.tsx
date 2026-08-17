'use client';

interface PainPoint {
  num: string;
  title: string;
  desc: string;
}

const PAIN_POINTS: PainPoint[] = [
  {
    num: '01',
    title: 'Quá tải hàng trăm nhóm Zalo đại lý',
    desc: 'Doanh nghiệp phân phối thường vận hành từ 100 đến hơn 300 nhóm Zalo. Đơn hàng gửi về rải rác cả ngày lẫn đêm khiến nhân sự dễ bỏ sót hoặc phản hồi chậm trễ.',
  },
  {
    num: '02',
    title: 'Tin nhắn gõ vội, viết tắt và ảnh bảng kê',
    desc: 'Đại lý nhắn tin không dấu, dùng từ lóng địa phương (VD: "TN" = Thái Nguyên, "Felix" = Mã FLX-01) hoặc gửi ảnh chụp hóa đơn viết tay, không thể xử lý bằng bot thông thường.',
  },
  {
    num: '03',
    title: 'Nghẽn cổ chai nhập liệu thủ công',
    desc: 'Nhân viên sales phải liên tục đọc tin, tra file Excel giá, kiểm tra tồn kho chi nhánh, rồi gõ tay lại vào phần mềm quản lý (KiotViet, SAP, Base) — tốn 3–5 phút cho mỗi đơn.',
  },
  {
    num: '04',
    title: 'Rủi ro nhầm giá và vượt hạn mức công nợ',
    desc: 'Khi áp lực đơn hàng dồn dập vào giờ cao điểm, việc nhầm cấp giá đại lý, áp sai chương trình khuyến mãi hoặc quên kiểm tra nợ cũ rất dễ xảy ra.',
  },
];

export function OrderAutomationProblem() {
  return (
    <section className="order-problem-section" id="problem" aria-label="Bài toán xử lý đơn hàng B2B">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>BÀI TOÁN THỰC TẾ</span>
          </div>

          <h2 className="section-headline">
            Tại sao xử lý đơn hàng hội thoại
            <br />
            lại là điểm nghẽn lớn nhất?
          </h2>

          <p className="section-subheadline">
            Trong mô hình bán buôn và phân phối B2B tại Việt Nam, hội thoại Zalo là kênh chốt đơn chính. Nhưng việc xử lý hoàn toàn bằng thủ công đang giới hạn tốc độ tăng trưởng của doanh nghiệp.
          </p>
        </div>

        <div className="pain-points-grid">
          {PAIN_POINTS.map((item) => (
            <div key={item.num} className="pain-point-card">
              <div className="pain-num">{item.num}</div>
              <h3 className="pain-title">{item.title}</h3>
              <p className="pain-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
