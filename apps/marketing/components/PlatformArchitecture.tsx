'use client';

import { useState } from 'react';

interface LayerItem {
  id: number;
  layerTag: string;
  name: string;
  subtitle: string;
  metric: string;
  desc: string;
  capabilities: string[];
  visualType: 'schema' | 'rules' | 'human';
}

const LAYERS: LayerItem[] = [
  {
    id: 0,
    layerTag: 'LỚP 01: THẤU HIỂU',
    name: 'AI Trích xuất có Ràng buộc',
    subtitle: 'Đọc hiểu đa kênh nhưng không sinh dữ liệu tùy tiện',
    metric: 'Ép kiểu Schema Chặt chẽ',
    desc: 'AI tiếp nhận các luồng hội thoại phi cấu trúc (tin nhắn viết tắt, không dấu, ảnh chụp đơn) và ánh xạ chặt chẽ vào từ điển đóng của doanh nghiệp, giúp giảm thiểu tối đa hiện tượng trích xuất sai lệch so với danh mục chuẩn.',
    capabilities: [
      'Nhận diện 7 loại ý định (Đặt hàng, Báo giá, Tra cứu, Hỗ trợ...)',
      'Chuẩn hóa từ viết tắt địa phương và danh mục SKU nội bộ',
      'Định dạng đầu ra JSON bắt buộc theo schema xác thực trước',
      'Không giao quyền tính toán hay ra quyết định kinh doanh cho AI',
    ],
    visualType: 'schema',
  },
  {
    id: 1,
    layerTag: 'LỚP 02: QUY TẮC NGHIỆP VỤ',
    name: 'Rules Engine Tất định Độc lập',
    subtitle: 'AI không tự tính tiền, không tự quyết chính sách',
    metric: 'Quy tắc Giá Tất định',
    desc: 'Trọng tâm vận hành của nexagnet: Toàn bộ bảng giá, hạn mức công nợ, chính sách chiết khấu và điều khoản được tính toán bởi Rules Engine bằng mã nguồn TypeScript từ Nguồn sự thật (Source of Truth) trong cơ sở dữ liệu.',
    capabilities: [
      'Tính toán giá lẻ, giá đại lý, thuế VAT và cước vận chuyển tất định',
      'Kiểm tra tồn kho thời gian thực và hạn mức công nợ theo từng cấp phân phối',
      'Độc lập với AI: Đảm bảo độ chính xác theo đúng cấu hình và quy chế công ty',
    ],
    visualType: 'rules',
  },
  {
    id: 2,
    layerTag: 'LỚP 03: KIỂM SOÁT & THỰC THI',
    name: 'Cổng Phân luồng & Human-in-the-Loop',
    subtitle: 'Tự động trong ngưỡng an toàn, con người luôn nắm quyền kiểm soát',
    metric: 'Chuyển giao Ngoại lệ',
    desc: 'Cổng kiểm duyệt phân tách rõ ràng: Đơn hàng hợp lệ trong hạn mức được gửi xác nhận; các đơn vượt ngưỡng, thiếu thông tin hoặc sai lệch giá lập tức được định tuyến về hàng việc của nhân sự trước khi gửi.',
    capabilities: [
      'Ngưỡng tự động hóa an toàn có thể tùy chỉnh linh hoạt',
      'Hàng việc nhân sự trực quan với gợi ý giải pháp từ hệ thống',
      'Lưu vết kiểm toán chi tiết từng bước trích xuất, đối soát và gửi tin',
      'Kill-switch: Tạm dừng gửi tin tự động khẩn cấp bất cứ lúc nào',
    ],
    visualType: 'human',
  },
];

export function PlatformArchitecture() {
  const [activeLayer, setActiveLayer] = useState<number>(1);
  const currentLayer: LayerItem = LAYERS[activeLayer] ?? LAYERS[0]!;

  return (
    <section className="architecture-section" id="platform" aria-label="Kiến trúc Nền tảng 3 Lớp">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>KIẾN TRÚC VẬN HÀNH 3 LỚP</span>
          </div>

          <h2 className="section-headline">
            AI thấu hiểu. Quy tắc quyết định.
            <br />
            Con người luôn làm chủ.
          </h2>

          <p className="section-subheadline">
            Khác biệt với các chatbot AI hội thoại tự do, nexagnet tách bạch rạch ròi giữa năng lực đọc hiểu ngôn ngữ của AI và logic quy tắc kinh doanh tất định của doanh nghiệp.
          </p>
        </div>

        {/* 3-Layer Interactive Inspector */}
        <div className="architecture-grid">
          {/* Left: Interactive Layer Navigation Cards */}
          <div className="layers-nav-list" role="tablist" aria-label="Các lớp kiến trúc">
            {LAYERS.map((layer) => (
              <div
                key={layer.id}
                className={`layer-nav-card ${activeLayer === layer.id ? 'active' : ''}`}
                onClick={() => setActiveLayer(layer.id)}
                role="tab"
                tabIndex={0}
                aria-selected={activeLayer === layer.id}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveLayer(layer.id);
                  }
                }}
              >
                <div className="layer-nav-indicator" aria-hidden="true" />
                <div className="layer-nav-header">
                  <div className="layer-nav-badge-group">
                    <span className="layer-num">0{layer.id + 1}</span>
                    <span className="layer-tag">{layer.layerTag}</span>
                  </div>
                  <span className="layer-metric">{layer.metric}</span>
                </div>
                <h3 className="layer-nav-title">{layer.name}</h3>
                <p className="layer-nav-sub">{layer.subtitle}</p>
              </div>
            ))}
          </div>

          {/* Right: Layer Live Detail Inspector */}
          <div className="layer-inspector-panel" role="tabpanel">
            <div className="inspector-chrome">
              <div className="inspector-chrome-left">
                <span className="inspector-badge">KIẾN TRÚC HỆ THỐNG</span>
                <span className="inspector-breadcrumb">nexagnet / layer-0{currentLayer.id + 1}</span>
              </div>
              <span className="inspector-tech-pill">Lõi TypeScript Tất định</span>
            </div>

            <div className="inspector-content">
              <div className="inspector-title-group">
                <span className="inspector-layer-tag">{currentLayer.layerTag}</span>
                <h3 className="inspector-heading">{currentLayer.name}</h3>
                <p className="inspector-description">{currentLayer.desc}</p>
              </div>

              <div className="inspector-features">
                <div className="features-label">NĂNG LỰC CỐT LÕI</div>
                <ul className="features-list">
                  {currentLayer.capabilities.map((cap, i) => (
                    <li key={i} className="feature-item">
                      <span className="feature-icon" aria-hidden="true">✓</span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Data Flow Visual Diagram */}
              <div className="inspector-visual-card">
                <div className="visual-card-header">
                  <span className="visual-tag">MÔ HÌNH DÒNG CHẢY DỮ LIỆU</span>
                  <span className="visual-status">● Logic Tất định</span>
                </div>

                {currentLayer.visualType === 'schema' && (
                  <div className="flow-visual-content">
                    <div className="mini-box">
                      <span className="mini-lbl">ĐẦU VÀO</span>
                      <span className="mini-val">Tin nhắn tự nhiên</span>
                    </div>
                    <span className="mini-arrow" aria-hidden="true">→</span>
                    <div className="mini-box highlight-box">
                      <span className="mini-lbl">AI TRÍCH XUẤT</span>
                      <span className="mini-val">Khớp từ điển đóng</span>
                    </div>
                    <span className="mini-arrow" aria-hidden="true">→</span>
                    <div className="mini-box">
                      <span className="mini-lbl">KẾT QUẢ</span>
                      <span className="mini-val">JSON Schema chuẩn</span>
                    </div>
                  </div>
                )}

                {currentLayer.visualType === 'rules' && (
                  <div className="flow-visual-content">
                    <div className="mini-box">
                      <span className="mini-lbl">DỮ LIỆU TRÍCH XUẤT</span>
                      <span className="mini-val">SKU, Số lượng, Đại lý</span>
                    </div>
                    <span className="mini-arrow" aria-hidden="true">→</span>
                    <div className="mini-box highlight-box">
                      <span className="mini-lbl">RULES ENGINE</span>
                      <span className="mini-val">Tính giá, Công nợ, Tồn kho</span>
                    </div>
                    <span className="mini-arrow" aria-hidden="true">→</span>
                    <div className="mini-box">
                      <span className="mini-lbl">ĐỐI SOÁT</span>
                      <span className="mini-val">Hợp lệ / Vượt hạn mức</span>
                    </div>
                  </div>
                )}

                {currentLayer.visualType === 'human' && (
                  <div className="flow-visual-content split-flow">
                    <div className="mini-box">
                      <span className="mini-lbl">KẾT QUẢ ĐỐI SOÁT</span>
                      <span className="mini-val">Đơn hàng đã tính toán</span>
                    </div>
                    <span className="mini-arrow" aria-hidden="true">→</span>
                    <div className="mini-branches">
                      <div className="mini-branch">
                        <strong>Trong ngưỡng:</strong> Tự động gửi xác nhận
                      </div>
                      <div className="mini-branch">
                        <strong>Vượt ngưỡng:</strong> Chuyển nhân sự duyệt
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3 Core Architecture Principles Banner */}
        <div className="architecture-footer-banner">
          <div className="banner-item">
            <div className="banner-icon-wrap">01</div>
            <div className="banner-text">
              <h4 className="banner-title">Mở rộng theo module</h4>
              <p className="banner-desc">
                Doanh nghiệp bắt đầu từ 1 quy trình và mở rộng dần mà không phải đập đi xây lại.
              </p>
            </div>
          </div>

          <div className="banner-divider" aria-hidden="true" />

          <div className="banner-item">
            <div className="banner-icon-wrap">02</div>
            <div className="banner-text">
              <h4 className="banner-title">Nguồn sự thật tập trung</h4>
              <p className="banner-desc">
                Mọi bảng giá, chính sách và danh mục quản trị tại một nơi duy nhất trên cơ sở dữ liệu.
              </p>
            </div>
          </div>

          <div className="banner-divider" aria-hidden="true" />

          <div className="banner-item">
            <div className="banner-icon-wrap">03</div>
            <div className="banner-text">
              <h4 className="banner-title">Kiểm soát an toàn chặt chẽ</h4>
              <p className="banner-desc">
                Không bao giờ để AI tự ý thực hiện các nghiệp vụ tài chính vượt quá thẩm quyền.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
