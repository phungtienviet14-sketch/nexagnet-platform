import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { DemoCTA } from '../../components/DemoCTA';
import { INDUSTRIES_DATA } from '../../data/industries';

export const metadata: Metadata = {
  title: 'Giải Pháp AI Agent Theo Ngành — nexagnet',
  description:
    'Khám phá các giải pháp AI Agent được thiết kế chuyên biệt cho Bất động sản, Bán buôn B2B, Bán lẻ TMĐT, Spa & Thẩm mỹ, Y tế & Phòng khám, F&B Nhà hàng.',
  alternates: {
    canonical: 'https://nexagnet247.com/solutions',
  },
};

export default function SolutionsHubPage() {
  return (
    <div className="marketing-page-root">
      <Navbar />
      <main className="solutions-hub-main">
        {/* Hub Header */}
        <section className="hub-hero-section">
          <div className="container">
            <div className="hub-hero-content">
              <div className="section-eyebrow">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>DANH MỤC GIẢI PHÁP DOANH NGHIỆP</span>
              </div>
              <h1 className="hub-headline">
                AI Agent Tinh Chỉnh Sâu
                <br />
                Theo Từng Ngành Nghề.
              </h1>
              <p className="hub-subheadline">
                Mỗi mô hình kinh doanh có quy trình và ngôn ngữ giao tiếp riêng. nexagnet cung cấp các gói giải pháp AI Agent chuyên sâu, tích hợp sẵn quy tắc ngành và kho tri thức chuyên biệt.
              </p>
            </div>
          </div>
        </section>

        {/* Industry Detailed List */}
        <section className="hub-list-section">
          <div className="container">
            <div className="hub-grid">
              {INDUSTRIES_DATA.map((ind, index) => (
                <div key={ind.slug} className="hub-industry-card">
                  <div className="card-header-bar">
                    <div className="ind-meta-left">
                      <span className="ind-icon-lg">{ind.icon}</span>
                      <div>
                        <span className="ind-num">NGÀNH 0{index + 1}</span>
                        <h2 className="ind-title-lg">{ind.title}</h2>
                      </div>
                    </div>
                    <span className="ind-badge-status">Sẵn sàng vận hành</span>
                  </div>

                  <p className="ind-desc-main">{ind.description}</p>

                  <div className="ind-usecases-box">
                    <div className="box-heading">TÌNH HUỐNG ỨNG DỤNG TIÊU BIỂU:</div>
                    <div className="usecases-list">
                      {ind.useCases.map((uc, uIdx) => (
                        <div key={uIdx} className="uc-item">
                          <span className="uc-bullet">●</span>
                          <div>
                            <strong>{uc.title}:</strong> {uc.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ind-metrics-row">
                    {ind.metrics.map((m, mIdx) => (
                      <div key={mIdx} className="metric-chip">
                        <span className="m-val">{m.value}</span>
                        <span className="m-lbl">{m.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="card-footer-action">
                    <Link href={`/solutions/${ind.slug}`} className="btn-primary view-solution-btn">
                      <span>Xem chi tiết giải pháp {ind.title}</span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 3.5L10.5 8L6 12.5"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <DemoCTA />
      </main>
      <Footer />
    </div>
  );
}
