'use client';

export interface PainPointItem {
  num: string;
  title: string;
  desc: string;
  consequence?: string;
}

interface DepartmentPainPointsProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  points: PainPointItem[];
}

export function DepartmentPainPoints({
  eyebrow = 'ĐIỂM NGHẼN VẬN HÀNH PHÒNG BAN',
  title,
  subtitle,
  points,
}: DepartmentPainPointsProps) {
  return (
    <section className="department-painpoints-section" aria-label="Điểm nghẽn vận hành">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>
          <h2 className="section-headline">{title}</h2>
          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className="painpoints-grid">
          {points.map((p, idx) => (
            <div key={idx} className="painpoint-card">
              <div className="painpoint-num">{p.num}</div>
              <div className="painpoint-content">
                <h3 className="painpoint-title">{p.title}</h3>
                <p className="painpoint-desc">{p.desc}</p>
                {p.consequence && (
                  <div className="painpoint-consequence">
                    <span className="consequence-label">Hệ quả:</span>
                    <span className="consequence-text">{p.consequence}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
