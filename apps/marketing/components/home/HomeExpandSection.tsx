'use client';

import Link from 'next/link';

interface StageItem {
  stageNum: string;
  title: string;
  desc: string;
}

const STAGES: StageItem[] = [
  {
    stageNum: '01',
    title: 'Một quy trình cụ thể',
    desc: 'Giải quyết ngay điểm nghẽn lớn nhất: tiếp nhận đơn hàng, hỗ trợ giải đáp chính sách hoặc phát tin CSKH.',
  },
  {
    stageNum: '02',
    title: 'Mở rộng luồng công việc',
    desc: 'Bổ sung thêm các module hỗ trợ bán hàng, phân loại khách hàng tiềm năng và tích hợp hệ thống quản trị.',
  },
  {
    stageNum: '03',
    title: 'Đa phòng ban & Đa kênh',
    desc: 'Đồng bộ hóa vận hành giữa Sales, CSKH, Kế toán và Kho vận trên cùng một nguồn sự thật duy nhất.',
  },
  {
    stageNum: '04',
    title: 'Nền tảng AI toàn diện',
    desc: 'Tự động hóa vận hành có kiểm soát, giám sát hiệu suất thời gian thực và liên tục tối ưu theo dữ liệu kinh doanh.',
  },
];

export function HomeExpandSection() {
  return (
    <section className="home-expand-section" aria-label="Mở rộng linh hoạt">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>LỘ TRÌNH MỞ RỘNG</span>
          </div>

          <h2 className="section-headline">
            Bắt đầu nhỏ. Mở rộng khi cần.
          </h2>

          <p className="section-subheadline">
            Không cần phải đầu tư lớn hay xáo trộn toàn bộ quy trình ngay từ đầu. nexagnet đồng hành cùng sự phát triển của doanh nghiệp qua từng giai đoạn vững chắc.
          </p>
        </div>

        <div className="expand-stages-grid">
          {STAGES.map((st, idx) => (
            <div key={idx} className="expand-stage-card">
              <div className="stage-num-badge">{st.stageNum}</div>
              <h3 className="stage-card-title">{st.title}</h3>
              <p className="stage-card-desc">{st.desc}</p>
            </div>
          ))}
        </div>

        <div className="expand-cta-row">
          <Link href="/resources/roadmap" className="expand-roadmap-link">
            <span>Xem định hướng mở rộng hệ sinh thái nexagnet</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
