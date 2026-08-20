'use client';

import { useBranding } from '../../lib/branding';

/** Generic foundation experience with no messaging or sales-order dependency. */
export function KnowledgeWorkspace() {
  const branding = useBranding();

  return (
    <main className="knowledge-workspace" data-experience="knowledge-workspace">
      <header className="knowledge-workspace__header">
        <span className="knowledge-workspace__monogram" aria-hidden="true">
          {branding.monogram}
        </span>
        <div>
          <p className="knowledge-workspace__eyebrow">{branding.shortName}</p>
          <h1>Không gian tri thức</h1>
          <p>Quản lý nội dung và nguồn tri thức dùng chung cho trợ lý doanh nghiệp.</p>
        </div>
      </header>
      <nav aria-label="Điều hướng không gian tri thức">
        <a className="knowledge-workspace__link" href="/settings">
          Mở quản lý nội dung →
        </a>
      </nav>
    </main>
  );
}
