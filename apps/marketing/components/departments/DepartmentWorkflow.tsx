'use client';

export interface WorkflowStep {
  step: string;
  tag: string;
  role: 'ai' | 'rules' | 'human' | 'system';
  title: string;
  desc: string;
  example?: string;
}

interface DepartmentWorkflowProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  steps: WorkflowStep[];
  governanceNote?: string;
}

export function DepartmentWorkflow({
  eyebrow = 'LUỒNG QUY TRÌNH CÓ AI HỖ TRỢ',
  title,
  subtitle,
  steps,
  governanceNote,
}: DepartmentWorkflowProps) {
  return (
    <section className="department-workflow-section" aria-label="Luồng quy trình phòng ban">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>
          <h2 className="section-headline">{title}</h2>
          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className="workflow-steps-chain">
          {steps.map((st, idx) => (
            <div key={idx} className={`workflow-step-card role-${st.role}`}>
              <div className="step-card-header">
                <div className="step-badge-group">
                  <span className="step-index">{st.step}</span>
                  <span className="step-tag">{st.tag}</span>
                </div>
                <span className={`step-role-badge badge-${st.role}`}>
                  {st.role === 'ai' && '🧠 AI Đọc hiểu & Bóc tách'}
                  {st.role === 'rules' && '⚖️ Rules Engine tất định'}
                  {st.role === 'human' && '🛡️ Con người Kiểm soát & Duyệt'}
                  {st.role === 'system' && '⚙️ Hệ thống Thực thi & Lưu vết'}
                </span>
              </div>

              <div className="step-card-body">
                <h3 className="step-title">{st.title}</h3>
                <p className="step-desc">{st.desc}</p>

                {st.example && (
                  <div className="step-example-box">
                    <span className="example-label">Dữ liệu thực tế / Kết quả:</span>
                    <code className="example-code">{st.example}</code>
                  </div>
                )}
              </div>

              {idx < steps.length - 1 && (
                <div className="step-connector-down" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="connector-arrow-svg">
                    <path d="M8 3V13M8 13L4 9M8 13L12 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {governanceNote && (
          <div className="workflow-governance-callout">
            <div className="gov-callout-icon">🛡️</div>
            <div className="gov-callout-content">
              <span className="gov-callout-title">Chốt chặn kiểm soát &amp; An toàn dữ liệu</span>
              <p className="gov-callout-text">{governanceNote}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
