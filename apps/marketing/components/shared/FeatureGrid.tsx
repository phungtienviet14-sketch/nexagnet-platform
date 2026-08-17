'use client';

interface FeatureItem {
  icon: string;
  title: string;
  desc: string;
  bullets?: string[];
  badge?: string;
}

interface FeatureGridProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  features: FeatureItem[];
  columns?: 2 | 3 | 4;
}

export function FeatureGrid({
  eyebrow = 'NĂNG LỰC CỐT LÕI',
  title,
  subtitle,
  features,
  columns = 3,
}: FeatureGridProps) {
  return (
    <section className="feature-grid-section" aria-label="Năng lực cốt lõi">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>

          <h2 className="section-headline">{title}</h2>

          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className={`features-cards-grid cols-${columns}`}>
          {features.map((feat, idx) => (
            <div key={idx} className="feature-card">
              <div className="feat-header">
                <div className="feat-icon-wrap">{feat.icon}</div>
                {feat.badge && <span className="feat-badge">{feat.badge}</span>}
              </div>

              <h3 className="feat-title">{feat.title}</h3>
              <p className="feat-desc">{feat.desc}</p>

              {feat.bullets && feat.bullets.length > 0 && (
                <div className="feat-bullets-list">
                  {feat.bullets.map((b, bIdx) => (
                    <div key={bIdx} className="feat-bullet-line">
                      <span className="b-check">✓</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
