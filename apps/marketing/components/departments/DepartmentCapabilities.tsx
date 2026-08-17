'use client';

export interface CapabilityCard {
  icon: string;
  title: string;
  desc: string;
  bullets: string[];
}

interface DepartmentCapabilitiesProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  capabilities: CapabilityCard[];
  columns?: 2 | 3;
}

export function DepartmentCapabilities({
  eyebrow = 'NĂNG LỰC HỖ TRỢ PHÒNG BAN',
  title,
  subtitle,
  capabilities,
  columns = 3,
}: DepartmentCapabilitiesProps) {
  return (
    <section className="department-capabilities-section" aria-label="Năng lực hỗ trợ">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>
          <h2 className="section-headline">{title}</h2>
          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className={`capabilities-grid cols-${columns}`}>
          {capabilities.map((c, idx) => (
            <div key={idx} className="capability-card">
              <div className="card-icon-wrap">
                <span className="card-icon">{c.icon}</span>
              </div>
              <h3 className="card-title">{c.title}</h3>
              <p className="card-desc">{c.desc}</p>
              <ul className="card-bullets-list">
                {c.bullets.map((b, bIdx) => (
                  <li key={bIdx} className="card-bullet-item">
                    <span className="bullet-check" aria-hidden="true">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
