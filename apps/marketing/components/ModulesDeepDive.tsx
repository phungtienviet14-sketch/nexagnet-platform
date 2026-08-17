'use client';

import { useState } from 'react';

interface ModuleTab {
  id: string;
  moduleNum: string;
  name: string;
  tagline: string;
  desc: string;
  statusBadge: string;
  statusType: 'live' | 'ready';
  capabilities: { title: string; desc: string }[];
  impactMetric: { value: string; label: string };
  previewContent: {
    inputLabel: string;
    inputValue: string;
    rulesLabel: string;
    rulesList: string[];
    actionLabel: string;
    actionDetail: string;
  };
}

const MODULES: ModuleTab[] = [
  {
    id: 'orders',
    moduleNum: 'MODULE 01',
    name: 'Phân hệ Đơn hàng',
    tagline: 'Tự động hóa xử lý đơn hàng từ hội thoại Zalo & đa kênh',
    desc: 'Chuyển hóa tin nhắn đặt hàng tự nhiên, viết tắt, không dấu và ảnh chụp bảng từ các nhóm Zalo đại lý thành đơn hàng chuẩn hóa. Tự động kiểm tra SKU, tồn kho và công nợ trước khi xác nhận.',
    statusBadge: 'Đang chạy thực tế',
    statusType: 'live',
    capabilities: [
      {
        title: 'Đọc hiểu ngôn ngữ tự nhiên',
        desc: 'Trích xuất chính xác SKU, số lượng, địa chỉ và đại lý từ các tin nhắn gõ vội hoặc viết tắt địa phương.',
      },
      {
        title: 'Đối soát quy tắc kinh doanh',
        desc: 'Tự động kiểm tra giá bán theo cấp đại lý, tồn kho khả dụng và hạn mức công nợ trước khi xử lý.',
      },
      {
        title: 'Phân luồng an toàn tự động',
        desc: 'Đơn hợp lệ trong ngưỡng an toàn tự động gửi xác nhận; đơn lớn hoặc có ngoại lệ lập tức chuyển nhân sự duyệt.',
      },
    ],
    impactMetric: {
      value: 'Tức thì',
      label: 'Thời gian hoàn tất xử lý & đối soát một đơn hàng',
    },
    previewContent: {
      inputLabel: 'ĐẦU VÀO',
      inputValue: '“Gửi về TN cho c 15 cái Felix, cước báo sau nhé”',
      rulesLabel: 'ĐỐI SOÁT QUY TẮC',
      rulesList: [
        'Tổng SL: 15 (Hợp lệ) · Công nợ trong hạn mức cho phép',
      ],
      actionLabel: 'HÀNH ĐỘNG HỆ THỐNG',
      actionDetail: 'Soạn đơn FLX-01 (SL: 15) · Áp giá Đại lý Cấp 1 · Gửi xác nhận',
    },
  },
  {
    id: 'knowledge',
    moduleNum: 'MODULE 02',
    name: 'Tri thức & CSKH',
    tagline: 'Tra cứu chính sách bảo hành, kỹ thuật & giải đáp chuẩn xác',
    desc: 'Hỗ trợ đại lý tra cứu chính sách bảo hành, thông số kỹ thuật, catalogue sản phẩm. Các câu trả lời được đối chiếu trực tiếp từ tài liệu nội bộ đã duyệt, kèm trích dẫn văn bản tương ứng.',
    statusBadge: 'SẴN SÀNG',
    statusType: 'ready',
    capabilities: [
      {
        title: 'Truy vấn từ nguồn tài liệu chuẩn',
        desc: 'Hỗ trợ đại lý tra cứu chính sách bảo hành, thông số kỹ thuật, catalogue sản phẩm kèm trích dẫn văn bản.',
      },
      {
        title: 'Đối chiếu điều khoản có căn cứ',
        desc: 'Tìm kiếm chính xác điều khoản trong tài liệu nội bộ, giảm thiểu tối đa rủi ro trả lời sai lệch.',
      },
      {
        title: 'Cập nhật tri thức tập trung',
        desc: 'Dễ dàng cập nhật bảng giá hoặc chính sách mới qua giao diện quản trị, dữ liệu đồng bộ ngay lập tức.',
      },
    ],
    impactMetric: {
      value: 'Đối chiếu',
      label: 'Câu trả lời có nguồn trích dẫn từ tài liệu đã duyệt',
    },
    previewContent: {
      inputLabel: 'CÂU HỎI ĐẠI LÝ',
      inputValue: '“Quạt tháp Felix BH bao lâu em? Có đổi mới nếu lỗi nguồn không?”',
      rulesLabel: 'TRÍCH DẪN TRI THỨC',
      rulesList: [
        'Chính sách BH 2026: BH 24 tháng chính hãng',
        'Đổi mới trong 30 ngày đầu nếu lỗi nguồn do NSX',
      ],
      actionLabel: 'PHẢN HỒI SOẠN THẢO',
      actionDetail: 'Trả lời trích dẫn Điều 4.2 Sổ tay BH · Kèm link video kỹ thuật',
    },
  },
  {
    id: 'campaigns',
    moduleNum: 'MODULE 03',
    name: 'Chiến dịch Thông minh',
    tagline: 'Phát tin CSKH định kỳ, phân bổ hàng đợi chống khóa kênh',
    desc: 'Lên lịch và gửi thông báo chính sách, chương trình khuyến mãi định kỳ tới các nhóm Zalo đại lý. Cơ chế giãn cách thời gian (pacing) và kiểm duyệt nội dung giúp phân bổ lưu lượng gửi an toàn cho kênh liên lạc.',
    statusBadge: 'SẴN SÀNG',
    statusType: 'ready',
    capabilities: [
      {
        title: 'Phân bổ giãn cách an toàn (Pacing)',
        desc: 'Cơ chế giãn cách thời gian (pacing) và kiểm duyệt nội dung giúp phân bổ lưu lượng gửi an toàn cho kênh liên lạc.',
      },
      {
        title: 'Cá nhân hóa nội dung theo đại lý',
        desc: 'Tự động chèn tên đại lý, mức chiết khấu riêng biệt và người phụ trách vào từng nội dung tin nhắn.',
      },
      {
        title: 'Báo cáo tiếp cận & tương tác',
        desc: 'Theo dõi tỷ lệ gửi thành công, phản hồi của đại lý và danh sách các nhóm cần liên hệ lại.',
      },
    ],
    impactMetric: {
      value: 'Hàng đợi',
      label: 'Cơ chế giãn cách luồng gửi chống spam kênh liên lạc',
    },
    previewContent: {
      inputLabel: 'CHIẾN DỊCH KHUYẾN MÃI',
      inputValue: '“Thông báo biểu giá chính sách tới các Nhóm Đại lý Cấp 1”',
      rulesLabel: 'ĐIỀU PHỐI HÀNG ĐỢI',
      rulesList: [
        'Phân bổ 30-45 giây/tin · Cá nhân hóa lời chào',
        'Hạn mức gửi trong khung giờ quy định',
      ],
      actionLabel: 'TIẾN ĐỘ THỰC THI',
      actionDetail: 'Đã phát tin thành công · Lưu nhật ký gửi tin',
    },
  },
];

export function ModulesDeepDive() {
  const [activeModuleId, setActiveModuleId] = useState<string>('orders');
  const activeModule = MODULES.find((m) => m.id === activeModuleId) ?? MODULES[0]!;

  return (
    <section className="modules-section" id="modules" aria-label="Các Phân hệ Vận hành Chuyên sâu">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>CÁC PHÂN HỆ VẬN HÀNH CHUYÊN SÂU</span>
          </div>

          <h2 className="section-headline">
            Bắt đầu từ một quy trình.
            <br />
            Mở rộng khi doanh nghiệp sẵn sàng.
          </h2>

          <p className="section-subheadline">
            Mỗi phân hệ giải quyết trọn vẹn một nghiệp vụ vận hành, vận hành trên cùng một Lõi Quy tắc kinh doanh và Cổng kiểm duyệt nhân sự thống nhất.
          </p>
        </div>

        {/* Module Switcher Tabs */}
        <div className="module-tabs-wrapper" role="tablist" aria-label="Danh sách phân hệ">
          {MODULES.map((mod) => (
            <button
              key={mod.id}
              type="button"
              role="tab"
              aria-selected={activeModuleId === mod.id}
              className={`module-tab-btn ${activeModuleId === mod.id ? 'active' : ''}`}
              onClick={() => setActiveModuleId(mod.id)}
            >
              <span className={`tab-status-dot ${mod.statusType}`} aria-hidden="true" />
              <span>{mod.name}</span>
              <span className="tab-badge">{mod.statusBadge}</span>
            </button>
          ))}
        </div>

        {/* Active Module Showcase Card */}
        <div className="module-showcase-card" role="tabpanel">
          <div className="showcase-grid">
            {/* Left: Info, Capabilities, Metric */}
            <div className="showcase-info-col">
              <div className="showcase-eyebrow-group">
                <span className="showcase-eyebrow">{activeModule.moduleNum}</span>
                <span className={`showcase-status-tag ${activeModule.statusType}`}>
                  ● {activeModule.statusBadge}
                </span>
              </div>

              <h3 className="showcase-title">{activeModule.name}</h3>
              <p className="showcase-tagline">{activeModule.tagline}</p>
              <p className="showcase-desc">{activeModule.desc}</p>

              <div className="capabilities-wrap">
                <div className="capabilities-header">NĂNG LỰC NGHIỆP VỤ</div>
                <div className="capabilities-grid">
                  {activeModule.capabilities.map((cap, idx) => (
                    <div key={idx} className="capability-card">
                      <div className="cap-header">
                        <span className="cap-check" aria-hidden="true">✓</span>
                        <h4 className="cap-title">{cap.title}</h4>
                      </div>
                      <p className="cap-desc">{cap.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="impact-metric-box">
                <span className="metric-val">{activeModule.impactMetric.value}</span>
                <span className="metric-lbl">{activeModule.impactMetric.label}</span>
              </div>
            </div>

            {/* Right: Simulated Real-world Execution Preview */}
            <div className="showcase-preview">
              <div className="preview-chrome">
                <div className="preview-chrome-left">
                  <span className="preview-dot red" />
                  <span className="preview-dot yellow" />
                  <span className="preview-dot green" />
                  <span className="preview-title">Quy trình thực thi thực tế</span>
                </div>
                <span className="preview-status">Logic Tất định</span>
              </div>

              <div className="preview-body">
                {/* Step 1: Input */}
                <div className="preview-stage-box">
                  <div className="stage-box-top">
                    <span className="stage-box-tag input-tag">{activeModule.previewContent.inputLabel}</span>
                    <span className="stage-box-lbl">Tin nhắn đại lý</span>
                  </div>
                  <div className="stage-box-content quote-style">
                    {activeModule.previewContent.inputValue}
                  </div>
                </div>

                <div className="preview-arrow-connector" aria-hidden="true">↓</div>

                {/* Step 2: Rules Evaluation */}
                <div className="preview-stage-box rules-border">
                  <div className="stage-box-top">
                    <span className="stage-box-tag rules-tag">{activeModule.previewContent.rulesLabel}</span>
                    <span className="stage-box-lbl">Kiểm soát an toàn</span>
                  </div>
                  <div className="stage-box-content check-style">
                    <span className="check-bullet" aria-hidden="true">✓</span>
                    <span>{activeModule.previewContent.rulesList[0]}</span>
                  </div>
                </div>

                <div className="preview-arrow-connector" aria-hidden="true">↓</div>

                {/* Step 3: Action Execution */}
                <div className="preview-stage-box auto-border">
                  <div className="stage-box-top">
                    <span className="stage-box-tag auto-tag">{activeModule.previewContent.actionLabel}</span>
                    <span className="stage-box-lbl">Hành động tự động</span>
                  </div>
                  <div className="stage-box-content action-style">
                    <span className="action-bullet" aria-hidden="true">→</span>
                    <span>{activeModule.previewContent.actionDetail}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Workflow Expansion Banner */}
        <div className="custom-workflow-banner">
          <div className="custom-banner-left">
            <span className="custom-banner-tag">KHẢ NĂNG MỞ RỘNG LINH HOẠT</span>
            <h3 className="custom-banner-title">Cần thêm quy trình đặc thù cho doanh nghiệp của bạn?</h3>
            <p className="custom-banner-desc">
              Kiến trúc dạng module của nexagnet cho phép tích hợp nhanh chóng các quy trình Báo giá tức thì, Đối soát công nợ định kỳ, hay Điều phối giao vận trên cùng hạ tầng bảo mật.
            </p>
          </div>
          <a href="#demo" className="btn-primary custom-cta-btn">
            Đăng ký tư vấn Module riêng →
          </a>
        </div>
      </div>
    </section>
  );
}
