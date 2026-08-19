'use client';

import type { KeyboardEvent, ReactNode } from 'react';

export type SettingsTabId =
  'zalo' | 'members' | 'source-truth' | 'content' | 'rules' | 'campaigns' | 'automation' | 'notifications' | 'readiness' | 'users' | 'audit';

export interface SettingsTab {
  id: SettingsTabId;
  code: string;
  label: string;
  description: string;
  panel: ReactNode;
}

type Props = {
  tabs: readonly SettingsTab[];
  activeTab: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
};

export function SettingsTabs({ tabs, activeTab, onChange }: Props) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const isNext = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!isPrevious && !isNext) return;
    event.preventDefault();
    const nextIndex = isPrevious
      ? (index - 1 + tabs.length) % tabs.length
      : (index + 1) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    onChange(nextTab.id);
    document.getElementById(`settings-tab-${nextTab.id}`)?.focus();
  };

  return (
    <div className="settings-workspace">
      <nav
        className="settings-index"
        aria-label="Các phần cấu hình"
        role="tablist"
        aria-orientation="vertical"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              className="settings-index__tab"
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span className="settings-index__code" aria-hidden="true">
                {tab.code}
              </span>
              <span>
                <strong>{tab.label}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      {tabs.map((tab) => (
        <section
          key={tab.id}
          id={`settings-panel-${tab.id}`}
          className="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          {tab.panel}
        </section>
      ))}
    </div>
  );
}
