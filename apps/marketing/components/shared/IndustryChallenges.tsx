'use client';

interface ChallengeItem {
  num: string;
  title: string;
  desc: string;
}

interface IndustryChallengesProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  challenges: ChallengeItem[];
}

export function IndustryChallenges({
  eyebrow = 'THÁCH THỨC VẬN HÀNH THỰC TẾ',
  title,
  subtitle,
  challenges,
}: IndustryChallengesProps) {
  return (
    <section className="industry-challenges-section" aria-label="Thách thức thực tế">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>

          <h2 className="section-headline">{title}</h2>

          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className="challenges-grid">
          {challenges.map((item) => (
            <div key={item.num} className="challenge-card">
              <div className="challenge-num">{item.num}</div>
              <h3 className="challenge-title">{item.title}</h3>
              <p className="challenge-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
