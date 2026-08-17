'use client';

import { useState } from 'react';

interface LayerItem {
  id: number;
  layerTag: string;
  name: string;
  subtitle: string;
  desc: string;
  highlights: string[];
  visualDetails: {
    title: string;
    items: string[];
  };
}

const LAYERS: LayerItem[] = [
  {
    id: 0,
    layerTag: 'LỚP 01: THẤU HIỂU',
    name: 'AI Trích xuất có Ràng buộc',
    subtitle: 'Đọc hiểu ngôn ngữ tự nhiên nhưng không sinh dữ liệu tùy tiện',
    desc: 'AI tiếp nhận hội thoại tự nhiên (tin nhắn viết tắt, không dấu, ảnh chụp bảng kê) và ánh xạ chặt chẽ vào từ điển đóng của doanh nghiệp theo cấu trúc JSON schema bắt buộc.',
    highlights: [
      'Nhận diện 7 loại ý định (Đặt hàng, Báo giá, Tra cứu, Hỗ trợ...)',
      'Chuẩn hóa từ viết tắt địa phương và danh mục SKU nội bộ',
      'Không giao quyền tính toán hay ra quyết định kinh doanh cho AI',
    ],
    visualDetails: {
      title: 'XÁC THỰC SCHEMA ĐẦU RA',
      items: [
        'Ý định: Đặt hàng B2B (Khớp từ điển)',
        'Mã SKU: FLX-01 (Khớp danh mục)',
        'Số lượng: 20 (Kiểu số nguyên hợp lệ)',
      ],
    },
  },
  {
    id: 1,
    layerTag: 'LỚP 02: QUY TẮC NGHIỆP VỤ',
    name: 'Rules Engine Tất định Độc lập',
    subtitle: 'AI không tự tính tiền, không tự quyết chính sách',
    desc: 'Toàn bộ bảng giá theo cấp đại lý, hạn mức công nợ, chính sách chiết khấu và điều khoản được tính toán bởi Rules Engine bằng mã nguồn TypeScript từ Nguồn sự thật (Source of Truth) trong cơ sở dữ liệu.',
    highlights: [
      'Tính toán giá lẻ, giá đại lý, thuế VAT và cước vận chuyển tất định 100%',
      'Đối soát hạn mức công nợ và điều kiện thương mại theo từng cấp phân phối',
      'Độc lập hoàn toàn với AI: Đảm bảo tính toán chính xác tuyệt đối',
    ],
    visualDetails: {
      title: 'ĐỐI SOÁT QUY TẮC KINH DOANH',
      items: [
        'Bảng giá: Áp biểu giá chuẩn theo cấp đối tác',
        'Thuế & Chiết khấu: Tính tất định 100% bằng TypeScript',
        'Chính sách: Hạn mức công nợ và điều khoản hợp lệ',
      ],
    },
  },
  {
    id: 2,
    layerTag: 'LỚP 03: KIỂM SOÁT & THỰC THI',
    name: 'Cổng Phân luồng & Human-in-the-Loop',
    subtitle: 'Tự động trong ngưỡng an toàn, con người luôn nắm quyền kiểm soát',
    desc: 'Cổng kiểm duyệt phân tách rõ ràng: Đơn hàng hợp lệ trong hạn mức được gửi xác nhận; các đơn vượt ngưỡng, thiếu thông tin hoặc sai lệch giá lập tức được định tuyến về hàng việc của nhân sự trước khi gửi.',
    highlights: [
      'Ngưỡng tự động hóa an toàn có thể tùy chỉnh linh hoạt theo từng giai đoạn',
      'Hàng việc nhân sự trực quan với gợi ý giải pháp từ hệ thống',
      'Kill-switch: Tạm dừng gửi tin tự động khẩn cấp bất cứ lúc nào',
    ],
    visualDetails: {
      title: 'PHÂN LUỒNG THỰC THI',
      items: [
        'Ngưỡng tự động: SL ≤ 50 (Đạt yêu cầu tự động)',
        'Đơn ngoại lệ: Chuyển hàng việc nhân sự duyệt',
        'Lưu vết kiểm toán: Audit Log thời gian thực',
      ],
    },
  },
];

export function ArchitectureThreeLayers() {
  const [activeLayer, setActiveLayer] = useState<number>(1);
  const currentLayer = LAYERS[activeLayer] ?? LAYERS[0]!;

  return (
    <section className="architecture-section" id="architecture" aria-label="Kiến trúc Nền tảng 3 Lớp">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>KIẾN TRÚC VẬN HÀNH 3 LỚP</span>
          </div>

          <h2 className="section-headline">
            AI hiểu. Quy tắc quyết định.
            <br />
            Con người kiểm soát.
          </h2>

          <p className="section-subheadline">
            Khác biệt cốt lõi của nexagnet: Chúng tôi không để AI trở thành một chiếc hộp đen tự quyết định giá cả hay quy chế. AI phụ trách thấu hiểu, Rules Engine lo tính toán, và con người giữ quyền quyết định cao nhất.
          </p>
        </div>

        <div className="architecture-grid">
          {/* Left: Layer Selector Tabs */}
          <div className="layers-nav-list" role="tablist" aria-label="Các lớp kiến trúc">
            {LAYERS.map((layer) => (
              <button
                key={layer.id}
                type="button"
                role="tab"
                aria-selected={activeLayer === layer.id}
                className={`layer-nav-card ${activeLayer === layer.id ? 'active' : ''}`}
                onClick={() => setActiveLayer(layer.id)}
              >
                <div className="layer-nav-top">
                  <span className="layer-nav-tag">{layer.layerTag}</span>
                  <span className="layer-active-indicator" />
                </div>
                <h3 className="layer-nav-name">{layer.name}</h3>
                <p className="layer-nav-subtitle">{layer.subtitle}</p>
              </button>
            ))}
          </div>

          {/* Right: Active Layer Inspector */}
          <div className="layer-inspector-panel">
            <div className="inspector-chrome-bar">
              <span className="inspector-tag">{currentLayer.layerTag}</span>
              <span className="inspector-badge">Kiểm soát chặt chẽ</span>
            </div>

            <div className="inspector-panel-body">
              <h3 className="inspector-title">{currentLayer.name}</h3>
              <p className="inspector-subtext">{currentLayer.subtitle}</p>
              <p className="inspector-desc">{currentLayer.desc}</p>

              <div className="inspector-highlights-box">
                <div className="highlights-title">ĐẶC ĐIỂM KỸ THUẬT:</div>
                <div className="highlights-list">
                  {currentLayer.highlights.map((item, idx) => (
                    <div key={idx} className="highlight-item">
                      <span className="h-bullet">✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="inspector-preview-box">
                <div className="preview-tag">{currentLayer.visualDetails.title}</div>
                <div className="preview-lines">
                  {currentLayer.visualDetails.items.map((it, iIdx) => (
                    <div key={iIdx} className="preview-line-item">
                      <span className="p-dot" />
                      <span>{it}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
