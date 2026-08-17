'use client';

interface BusinessFriction {
  num: string;
  tag: string;
  title: string;
  desc: string;
  impact: string;
}

const BUSINESS_PROBLEMS: BusinessFriction[] = [
  {
    num: '01',
    tag: 'DỮ LIỆU PHÂN MẢNH',
    title: 'Thông tin phân mảnh ở nhiều nơi',
    desc: 'Bảng giá, tồn kho, chính sách đại lý và lịch sử trao đổi nằm rải rác trên Zalo cá nhân, file Excel, nhóm chat và máy tính riêng của từng nhân viên.',
    impact: 'Mất thời gian tìm kiếm, dễ dẫn đến sai sót dữ liệu.',
  },
  {
    num: '02',
    tag: 'RỦI RO NHÂN SỰ',
    title: 'Công việc phụ thuộc vào chat, Excel và trí nhớ',
    desc: 'Quy trình vận hành thiếu một chuẩn chung có hệ thống, phụ thuộc quá nhiều vào trí nhớ cá nhân của từng nhân sự phụ trách.',
    impact: 'Khi nhân sự nghỉ việc hoặc vắng mặt, công việc lập tức bị gián đoạn.',
  },
  {
    num: '03',
    tag: 'ĐỨT GÃY LUỒNG VIỆC',
    title: 'Các phòng ban chuyển việc cho nhau thủ công',
    desc: 'Sales chuyển đơn cho Kho qua tin nhắn; Kho báo Kế toán qua giấy tờ; CSKH chuyển khiếu nại qua miệng — không có trạng thái theo dõi minh bạch.',
    impact: 'Việc bị rơi rớt, không ai chịu trách nhiệm điểm nghẽn.',
  },
  {
    num: '04',
    tag: 'THIẾU CẢNH BÁO',
    title: 'Người quản lý chỉ biết vấn đề khi nó đã xảy ra',
    desc: 'Không có cơ chế cảnh báo sớm về các đơn hàng vượt hạn mức công nợ, khiếu nại bị quá hạn hoặc giao dịch vi phạm chính sách chiết khấu.',
    impact: 'Ban giám đốc luôn ở thế bị động dập lửa sự cố.',
  },
  {
    num: '05',
    tag: 'THIẾU CHUẨN MỰC',
    title: 'Quy trình khác nhau tùy từng nhân viên',
    desc: 'Cùng một tình huống khách hỏi giá hoặc khiếu nại, nhân viên cũ trả lời một kiểu, nhân viên mới trả lời một kiểu khác, thiếu tính nhất quán.',
    impact: 'Trải nghiệm khách hàng không đồng đều, rủi ro cam kết sai.',
  },
  {
    num: '06',
    tag: 'AI RỜI RẠC',
    title: 'AI được dùng rời rạc, không gắn với quy trình thực tế',
    desc: 'Doanh nghiệp dùng các chatbot AI tự do chỉ biết nói chuyện chung chung mà không có quy tắc kinh doanh, không kết nối dữ liệu và không ai kiểm soát.',
    impact: 'AI trở thành món đồ chơi công nghệ thay vì công cụ vận hành.',
  },
];

export function HomeBusinessProblem() {
  return (
    <section className="home-business-problem-section" aria-label="Thách thức vận hành doanh nghiệp">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span className="mono-label">THÁCH THỨC VẬN HÀNH THỰC TẾ</span>
          </div>

          <h2 className="section-headline">
            Doanh nghiệp lớn lên.
            <br />
            Quy trình cũng trở nên khó kiểm soát hơn.
          </h2>

          <p className="section-subheadline">
            Khi quy mô tăng từ vài chục lên hàng trăm giao dịch mỗi ngày, sự đứt gãy giữa các phòng ban và sự phụ thuộc vào thao tác thủ công sẽ trở thành rào cản tăng trưởng lớn nhất.
          </p>
        </div>

        {/* Visual: Disconnected Silos vs Connected Layer */}
        <div className="problem-comparison-architecture">
          {/* Left Column: Disconnected Silos */}
          <div className="comparison-card silos-card">
            <div className="card-top-status status-danger">
              <span className="status-dot-danger" aria-hidden="true" />
              <span className="status-label">VẬN HÀNH PHÂN MẢNH TRUYỀN THỐNG</span>
            </div>
            
            <div className="silos-visual-cluster" aria-hidden="true">
              <div className="silo-node-item">
                <span className="node-code">SALES</span>
                <span className="node-detail">Zalo cá nhân / Chat</span>
              </div>
              <div className="broken-connector">
                <span className="broken-line" />
                <span className="broken-badge">Đứt gãy dữ liệu</span>
              </div>
              <div className="silo-node-item">
                <span className="node-code">KHO &amp; OPS</span>
                <span className="node-detail">File Excel / Ghi nhớ</span>
              </div>
              <div className="broken-connector">
                <span className="broken-line" />
                <span className="broken-badge">Chuyển việc tay</span>
              </div>
              <div className="silo-node-item">
                <span className="node-code">KẾ TOÁN</span>
                <span className="node-detail">Giấy tờ / Chứng từ rời</span>
              </div>
              <div className="broken-connector">
                <span className="broken-line" />
                <span className="broken-badge">Thiếu cảnh báo</span>
              </div>
              <div className="silo-node-item node-manager">
                <span className="node-code">BAN GIÁM ĐỐC</span>
                <span className="node-detail">Bị động khi có sự cố</span>
              </div>
            </div>

            <div className="card-summary-note">
              <p>Các phòng ban cô lập, chuyển việc thủ công bằng tin nhắn, người quản lý không nhìn thấy tắc nghẽn.</p>
            </div>
          </div>

          {/* Right Column: Connected AI Operations Layer */}
          <div className="comparison-card connected-card">
            <div className="card-top-status status-active">
              <span className="status-dot-active" aria-hidden="true" />
              <span className="status-label">VẬN HÀNH VỚI LỚP AI ĐIỀU PHỐI NEXAGNET</span>
            </div>

            <div className="connected-visual-cluster" aria-hidden="true">
              <div className="connected-core-hub">
                <div className="hub-header">
                  <span className="hub-motif" />
                  <span className="hub-name">nexagnet Operations Layer</span>
                </div>
                <span className="hub-desc">Rules tất định · Nguồn sự thật · Cổng duyệt</span>
              </div>

              <div className="hub-synced-nodes">
                <span className="synced-chip">Sales</span>
                <span className="synced-chip">Marketing</span>
                <span className="synced-chip">CSKH</span>
                <span className="synced-chip">Vận hành</span>
                <span className="synced-chip">Kế toán</span>
                <span className="synced-chip">Ban Giám đốc</span>
              </div>

              <div className="hub-telemetry-strip">
                <span className="live-signal">●</span>
                <span>Luồng công việc thông suốt · 100% Lưu vết kiểm toán</span>
              </div>
            </div>

            <div className="card-summary-note">
              <p>Quy trình thông suốt, quy tắc tự động hóa tất định, ngoại lệ có người duyệt, quản lý nhìn toàn cảnh thời gian thực.</p>
            </div>
          </div>
        </div>

        {/* 6 Friction Items - Clean Editorial Split Layout */}
        <div className="business-frictions-editorial-grid">
          {BUSINESS_PROBLEMS.map((item) => (
            <div key={item.num} className="friction-editorial-card">
              <div className="friction-card-meta">
                <span className="friction-index">{item.num}</span>
                <span className="friction-tag">{item.tag}</span>
              </div>
              <h3 className="friction-headline">{item.title}</h3>
              <p className="friction-body">{item.desc}</p>
              <div className="friction-impact-box">
                <span className="impact-indicator">Hệ quả:</span>
                <span className="impact-value">{item.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
