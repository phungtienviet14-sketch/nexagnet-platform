'use client';

interface FAQItem {
  q: string;
  a: string;
}

interface FAQAccordionProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  items: FAQItem[];
}

export function FAQAccordion({
  eyebrow = 'GIẢI ĐÁP THẮC MẮC',
  title = 'Câu hỏi thường gặp',
  subtitle = 'Những điều doanh nghiệp cần biết trước khi triển khai và vận hành.',
  items,
}: FAQAccordionProps) {
  return (
    <section className="faq-accordion-section" aria-label="Câu hỏi thường gặp">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>

          <h2 className="section-headline">{title}</h2>

          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className="faq-accordion-container">
          {items.map((item, idx) => (
            <details key={idx} className="faq-accordion-item">
              <summary className="faq-summary-bar">
                <span className="faq-q-text">{item.q}</span>
                <span className="faq-icon" aria-hidden="true">＋</span>
              </summary>
              <div className="faq-answer-body">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
