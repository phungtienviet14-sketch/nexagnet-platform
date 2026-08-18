'use client';

import { NexagnetIcon } from '@/components/shared/EnterpriseIcons';

interface SectorItem {
  iconKey: string;
  name: string;
  summary: string;
  examples: string[];
}

const SECTORS: SectorItem[] = [
  {
    iconKey: 'retail',
    name: 'Bán hàng & Phân phối B2B',
    summary: 'Nhà sản xuất, tổng kho phân phối và bán buôn qua nhiều nhóm đại lý.',
    examples: ['Tự động xử lý đơn Zalo', 'Đối soát công nợ & tồn kho', 'Báo giá nhanh theo cấp đại lý'],
  },
  {
    iconKey: 'spa',
    name: 'Dịch vụ & Chăm sóc Khách hàng',
    summary: 'Chuỗi spa, thẩm mỹ viện, phòng khám và dịch vụ đặt hẹn.',
    examples: ['Tư vấn phác đồ & bảng giá', 'Giữ chỗ & điều phối lịch hẹn', 'Nhắc lịch và CSKH sau dịch vụ'],
  },
  {
    iconKey: 'real-estate',
    name: 'Bất động sản',
    summary: 'Chủ đầu tư, sàn phân phối F1 và đội ngũ môi giới bất động sản.',
    examples: ['Tư vấn thông tin & tiến độ dự án', 'Lọc khách theo ngân sách', 'Đặt lịch tham quan nhà mẫu 24/7'],
  },
  {
    iconKey: 'education',
    name: 'Giáo dục & Đào tạo',
    summary: 'Trung tâm ngoại ngữ, học viện kỹ năng và các trường đào tạo.',
    examples: ['Tư vấn lộ trình học tập', 'Giải đáp chính sách học phí', 'Tiếp nhận đăng ký thi & xếp lớp'],
  },
  {
    iconKey: 'hr',
    name: 'Vận hành Nội bộ',
    summary: 'Doanh nghiệp cần chuẩn hóa tra cứu quy chế và tiếp nhận yêu cầu phòng ban.',
    examples: ['Tra cứu sổ tay nhân viên', 'Giải đáp chính sách phúc lợi', 'Tiếp nhận ticket IT & hành chính'],
  },
];

export function IndustryScopeSection() {
  return (
    <section className="industry-scope-section" id="scope" aria-label="Phạm vi ứng dụng đa ngành">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>KHẢ NĂNG THÍCH ỨNG RỘNG</span>
          </div>

          <h2 className="section-headline">
            Phù hợp với nhiều mô hình doanh nghiệp.
          </h2>

          <p className="section-subheadline">
            Kiến trúc phân tách giữa tầng thấu hiểu AI và tầng quy tắc nghiệp vụ giúp nexagnet dễ dàng cấu hình cho đa dạng các bài toán vận hành mà không bị giới hạn trong một ngành nghề cố định.
          </p>
        </div>

        <div className="sectors-grid">
          {SECTORS.map((sec, idx) => (
            <div key={idx} className="sector-card">
              <div className="sector-icon-box">
                <NexagnetIcon name={sec.iconKey} size={22} containerStyle="subtle" />
              </div>
              <h3 className="sector-name">{sec.name}</h3>
              <p className="sector-summary">{sec.summary}</p>
              <div className="sector-examples-list">
                {sec.examples.map((ex, eIdx) => (
                  <div key={eIdx} className="sector-ex-item">
                    <span className="ex-bullet" aria-hidden="true">
                      <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
                        <circle cx="3" cy="3" r="3" />
                      </svg>
                    </span>
                    <span>{ex}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
