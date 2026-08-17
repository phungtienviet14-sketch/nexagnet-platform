'use client';

interface WorkflowStep {
  step: string;
  tag: string;
  title: string;
  desc: string;
  example?: string;
}

interface WorkflowPreviewProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  steps: WorkflowStep[];
}

export function WorkflowPreview({
  eyebrow = 'QUY TRÌNH VẬN HÀNH',
  title,
  subtitle,
  steps,
}: WorkflowPreviewProps) {
  return (
    <section className="workflow-preview-section" aria-label="Quy trình vận hành">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>

          <h2 className="section-headline">{title}</h2>

          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className="workflow-steps-grid">
          {steps.map((st, idx) => (
            <div key={idx} className="workflow-step-card">
              <div className="wf-step-top">
                <span className="wf-step-num">{st.step}</span>
                <span className="wf-step-tag">{st.tag}</span>
              </div>

              <h3 className="wf-step-title">{st.title}</h3>
              <p className="wf-step-desc">{st.desc}</p>

              {st.example && (
                <div className="wf-example-box">
                  <span className="wf-ex-label">DỮ LIỆU THỰC THI:</span>
                  <p className="wf-ex-content">{st.example}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
