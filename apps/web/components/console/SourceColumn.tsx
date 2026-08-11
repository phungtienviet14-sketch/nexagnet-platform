'use client';

import type { OrderView } from '@netviet/shared';
import { useState } from 'react';
import { AppliedRulesPanel } from './AppliedRulesPanel';
import { KiotVietPanel } from './KiotVietPanel';
import { KnowledgePanel } from './KnowledgePanel';

type Tab = 'kb' | 'kv' | 'rules';

const TABS: { id: Tab; label: string }[] = [
  { id: 'kb', label: 'Kho tri thức' },
  { id: 'kv', label: 'KiotViet' },
  { id: 'rules', label: 'Luật đã áp' },
];

export function SourceColumn({ order }: { order?: OrderView }) {
  const [tab, setTab] = useState<Tab>('kb');

  return (
    <aside className="col source" aria-label="Nguồn sự thật">
      <p className="col-label">Nguồn sự thật</p>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`src-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`src-panel-${t.id}`}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`src-panel-${tab}`} aria-labelledby={`src-tab-${tab}`}>
        {tab === 'kb' && <KnowledgePanel order={order} />}
        {tab === 'kv' && <KiotVietPanel />}
        {tab === 'rules' && <AppliedRulesPanel order={order} />}
      </div>
    </aside>
  );
}
