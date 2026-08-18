'use client';

import Link from 'next/link';
import { NexagnetIcon } from '@/components/shared/EnterpriseIcons';

interface TrustPillar {
  iconKey: string;
  title: string;
  desc: string;
}

const TRUST_PILLARS: TrustPillar[] = [
  {
    iconKey: 'knowledge',
    title: 'Dữ liệu Doanh nghiệp là Nguồn sự thật',
    desc: 'Bảng giá, thông tin sản phẩm và chính sách kinh doanh được quản trị tập trung trong cơ sở dữ liệu. Mọi câu trả lời của AI đều phải tham chiếu từ nguồn này.',
  },
  {
    iconKey: 'rules',
    title: 'Quy tắc kinh doanh được tính toán tất định',
    desc: 'AI không tự tính tiền, không tự quyết chính sách. Toàn bộ logic giá, chiết khấu và công nợ do Rules Engine độc lập tính toán chính xác 100%.',
  },
  {
    iconKey: 'governance',
    title: 'Con người luôn giữ quyền kiểm soát',
    desc: 'Hệ thống tự động thực thi trong ngưỡng an toàn được cấu hình trước; các đơn lớn hoặc ngoại lệ lập tức chuyển giao cho nhân sự duyệt trước khi phát tin.',
  },
];

export function HomeTrustSection() {
  return (
    <section className="home-trust-section" aria-label="Kiểm soát và an toàn">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>KIỂM SOÁT &amp; AN TOÀN DOANH NGHIỆP</span>
          </div>

          <h2 className="section-headline">
            AI có thể linh hoạt.
            <br />
            Quyền kiểm soát vẫn thuộc về doanh nghiệp.
          </h2>

          <p className="section-subheadline">
            Chúng tôi không phát triển các chatbot AI tự do gây rủi ro tài chính hay sai lệch giá cả. nexagnet thiết lập các tầng bảo vệ nghiêm ngặt để doanh nghiệp luôn an tâm khi đưa AI vào vận hành.
          </p>
        </div>

        <div className="trust-pillars-grid">
          {TRUST_PILLARS.map((tp, idx) => (
            <div key={idx} className="trust-pillar-card">
              <div className="t-icon-box">
                <NexagnetIcon name={tp.iconKey} size={24} containerStyle="subtle" />
              </div>
              <h3 className="t-title">{tp.title}</h3>
              <p className="t-desc">{tp.desc}</p>
            </div>
          ))}
        </div>

        <div className="trust-action-banner">
          <div className="trust-banner-inner">
            <div className="banner-left">
              <h4>Tìm hiểu chi tiết về cơ chế kiểm soát &amp; quản trị AI</h4>
              <p>Khám phá cách Rules Engine, Nhật ký kiểm toán và Cổng kiểm duyệt nhân sự bảo vệ vận hành doanh nghiệp.</p>
            </div>
            <div className="banner-right">
              <Link href="/platform/control" className="btn-primary banner-cta-btn">
                <span>Khám phá Kiểm soát &amp; Quản trị</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
