import Link from 'next/link';

interface Pillar {
  id: string;
  category: string;
  badge: string;
  title: string;
  desc: string;
}

const PILLARS: Pillar[] = [
  {
    id: '01',
    category: 'BẢO VỆ DỮ LIỆU',
    badge: 'Nguyên tắc Quyền riêng tư',
    title: 'Bảo vệ & Phân quyền Dữ liệu',
    desc: 'Kiến trúc được thiết kế với các nguyên tắc bảo vệ dữ liệu, phân quyền và kiểm soát truy cập ngay từ đầu. Dữ liệu khách hàng, danh bạ và lịch sử vận hành được bảo vệ trên hạ tầng riêng biệt, không sử dụng để huấn luyện mô hình bên ngoài.',
  },
  {
    id: '02',
    category: 'MINH BẠCH VẬN HÀNH',
    badge: 'Nhật ký Vận hành',
    title: 'Nhật ký Kiểm toán cho Thao tác Quan trọng',
    desc: 'Mọi thao tác trích xuất của AI, từng phép tính giá của Rules Engine và lượt gửi tin xác nhận đều được ghi nhận thời gian thực kèm mã định danh, giúp doanh nghiệp dễ dàng rà soát và đối chiếu lịch sử.',
  },
  {
    id: '03',
    category: 'HUMAN-IN-THE-LOOP',
    badge: 'Kiểm soát Rủi ro',
    title: 'Ngưỡng An toàn & Phê duyệt Nhân sự',
    desc: 'Doanh nghiệp toàn quyền thiết lập hạn mức tự động hóa (Ví dụ: Đơn hàng số lượng trong ngưỡng cho phép). Bất kỳ giao dịch nào vượt ngưỡng, sai lệch giá hay có nghi vấn đều tự động chuyển về hàng việc của nhân sự trước khi gửi.',
  },
  {
    id: '04',
    category: 'QUẢN TRỊ RỦI RO',
    badge: 'Kiểm soát Tức thì',
    title: 'Nút Dừng Khẩn cấp (Kill Switch)',
    desc: 'Trao quyền kiểm soát cho ban điều hành: Cho phép tạm dừng tức thì việc gửi tin tự động, dừng phát chiến dịch hoặc chuyển sang chế độ thủ công chỉ bằng một thao tác điều khiển mà không làm gián đoạn luồng dữ liệu.',
  },
];

export function SecurityGovernance() {
  return (
    <section className="security-section" id="security" aria-label="Bảo mật và Quản trị Doanh nghiệp">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>AN TOÀN & QUẢN TRỊ DOANH NGHIỆP</span>
          </div>

          <h2 className="section-headline">
            Dữ liệu được bảo vệ nhiều lớp.
            <br />
            Doanh nghiệp luôn nắm quyền kiểm soát.
          </h2>

          <p className="section-subheadline">
            Được xây dựng cho các tổ chức coi trọng an toàn thông tin: Không chia sẻ dữ liệu cho bên thứ ba, lưu vết kiểm toán chi tiết và không bao giờ để AI vượt quyền hạn định mức.
          </p>
        </div>

        {/* 4 Security Pillars Grid */}
        <div className="security-grid">
          {PILLARS.map((pillar) => (
            <div key={pillar.id} className="security-card">
              <div className="security-card-header">
                <div className="security-badge-group">
                  <span className="security-num">{pillar.id}</span>
                  <span className="security-tag">{pillar.category}</span>
                </div>
                <span className="security-badge">{pillar.badge}</span>
              </div>

              <h3 className="security-card-title">{pillar.title}</h3>
              <p className="security-card-desc">{pillar.desc}</p>
            </div>
          ))}
        </div>

        {/* Governance Guarantee Banner */}
        <div className="compliance-banner">
          <div className="compliance-icon-wrap" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z"
                stroke="#3D5AFE"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 12L11 14L15 10"
                stroke="#3D5AFE"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h4 className="compliance-title">Cam kết Kiến trúc Cách ly & Quản trị Dữ liệu</h4>
            <p className="compliance-desc">
              Hệ thống hỗ trợ doanh nghiệp xây dựng quy trình quản trị dữ liệu phù hợp với yêu cầu thực tế: Cấu hình và dữ liệu được phân lập theo từng khách hàng, duy trì tính toàn vẹn và bảo mật nhiều lớp. Tìm hiểu chi tiết tại{' '}
              <Link href="/privacy" className="privacy-inline-link">
                Chính sách quyền riêng tư
              </Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
