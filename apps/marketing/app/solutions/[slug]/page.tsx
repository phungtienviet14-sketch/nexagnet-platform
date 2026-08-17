import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { Footer } from '../../../components/Footer';
import { DemoCTA } from '../../../components/DemoCTA';
import { INDUSTRIES_DATA } from '../../../data/industries';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return INDUSTRIES_DATA.map((ind) => ({
    slug: ind.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const ind = INDUSTRIES_DATA.find((item) => item.slug === slug);
  if (!ind) return { title: 'Giải pháp ngành — nexagnet' };

  return {
    title: `Chatbot AI cho ${ind.title} — ${ind.subtitle} | nexagnet`,
    description: ind.description,
    alternates: {
      canonical: `https://nexagnet247.com/solutions/${slug}`,
    },
  };
}

export default async function IndustryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const ind = INDUSTRIES_DATA.find((item) => item.slug === slug);

  if (!ind) {
    notFound();
  }

  const otherIndustries = INDUSTRIES_DATA.filter((i) => i.slug !== slug);

  return (
    <div className="marketing-page-root">
      <Navbar />

      <main className="solution-deepdive-main">
        {/* Breadcrumb & Hero */}
        <section className="deepdive-hero-section">
          <div className="container">
            <div className="breadcrumb-nav">
              <Link href="/solutions" className="back-link">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M10 12.5L5.5 8L10 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Quay lại Danh mục giải pháp</span>
              </Link>
            </div>

            <div className="deepdive-hero-content text-center">
              <div className="section-eyebrow justify-center">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>GIẢI PHÁP AI CHO {ind.title.toUpperCase()}</span>
              </div>

              <h1 className="deepdive-headline">
                Chatbot AI Cho {ind.title}
              </h1>

              <p className="deepdive-subheadline">
                {ind.subtitle}
              </p>

              <div className="hero-cta-group justify-center">
                <Link href="#demo" className="btn-primary hero-btn-main">
                  <span>Dùng thử miễn phí</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link href="/#pricing" className="btn-secondary hero-btn-sub">
                  <span>Xem bảng giá</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Core Value & Metrics */}
        <section className="industry-overview-section">
          <div className="container">
            <div className="industry-overview-grid">
              <div className="overview-left">
                <span className="overview-tag">TỔNG QUAN GIẢI PHÁP</span>
                <h2 className="overview-title">{ind.tagline}</h2>
                <p className="overview-desc">{ind.description}</p>

                <div className="overview-benefits-list">
                  {ind.keyBenefits.map((b, bIdx) => (
                    <div key={bIdx} className="overview-benefit-item">
                      <span className="check-icon">✓</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overview-right">
                <div className="metrics-card-stack">
                  <div className="metric-header-tag">HIỆU QUẢ VẬN HÀNH ĐƯỢC CHỨNG MINH</div>
                  {ind.metrics.map((m, mIdx) => (
                    <div key={mIdx} className="metric-block">
                      <div className="m-val-big">{m.value}</div>
                      <div className="m-lbl-text">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases Grid */}
        <section className="industry-usecases-section">
          <div className="container">
            <div className="section-header">
              <div className="section-eyebrow">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>TÌNH HUỐNG ỨNG DỤNG THỰC TẾ</span>
              </div>
              <h2 className="section-headline">Các nghiệp vụ tự động hóa trong ngành {ind.title}</h2>
            </div>

            <div className="usecases-grid-cards">
              {ind.useCases.map((uc, uIdx) => (
                <div key={uIdx} className="usecase-card">
                  <div className="uc-card-num">0{uIdx + 1}</div>
                  <h3 className="uc-card-title">{uc.title}</h3>
                  <p className="uc-card-desc">{uc.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="industry-faq-section">
          <div className="container">
            <div className="section-header">
              <div className="section-eyebrow">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>CÂU HỎI THƯỜNG GẶP</span>
              </div>
              <h2 className="section-headline">Giải đáp thắc mắc về AI cho {ind.title}</h2>
            </div>

            <div className="faqs-accordion-wrapper">
              {ind.faqs.map((faq, fIdx) => (
                <details key={fIdx} className="faq-accordion-item">
                  <summary className="faq-summary">
                    <span>{faq.question}</span>
                    <span className="faq-chevron" aria-hidden="true">＋</span>
                  </summary>
                  <div className="faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Cross-Industry Links Section */}
        <section className="cross-industry-section container my-16">
          <h3 className="cross-title">KHÁM PHÁ GIẢI PHÁP CHO CÁC NGÀNH KHÁC:</h3>
          <div className="cross-tags-wrap">
            {otherIndustries.map((other) => (
              <Link key={other.slug} href={`/solutions/${other.slug}`} className="cross-industry-tag">
                <span className="tag-icon">{other.icon}</span>
                <span>{other.title}</span>
              </Link>
            ))}
          </div>
        </section>

        <DemoCTA />
      </main>

      <Footer />
    </div>
  );
}
