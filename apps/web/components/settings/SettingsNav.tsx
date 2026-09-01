'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import {
  groupSettingsSections,
  settingsSection,
  settingsSectionHref,
  type SettingsSectionId,
} from './settings-composition';

/**
 * Dieu huong `/settings` — bon NHOM viec, khong phai mot hang the ngang hang.
 *
 * Moi muc la mot lien ket that (`/settings?section=…`) chu khong phai mot cai nut: khach phai gui
 * duoc duong dan cho dong nghiep, va F5 phai quay lai dung cho. Van bat phim mui ten nhu mot
 * `tablist` de di ban phim khong phai Tab qua tung muc mot.
 */

type Props = {
  sections: readonly SettingsSectionId[];
  activeSection: SettingsSectionId;
  onChange: (section: SettingsSectionId) => void;
  children: ReactNode;
};

export function SettingsNav({ sections, activeSection, onChange, children }: Props) {
  const groups = groupSettingsSections(sections);
  const flat = groups.flatMap((entry) => entry.sections.map((section) => section.id));

  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, id: SettingsSectionId) => {
    const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const isNext = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!isPrevious && !isNext) return;
    event.preventDefault();
    const index = flat.indexOf(id);
    const nextIndex = isPrevious
      ? (index - 1 + flat.length) % flat.length
      : (index + 1) % flat.length;
    const nextId = flat[nextIndex];
    if (!nextId) return;
    onChange(nextId);
    document.getElementById(`settings-nav-${nextId}`)?.focus();
  };

  return (
    <div className="settings-workspace">
      <nav className="settings-index" aria-label="Các phần cài đặt">
        {groups.map((entry) => (
          <section key={entry.group.id} className="settings-index__group">
            <h2 className="settings-index__group-title">{entry.group.label}</h2>
            <ul>
              {entry.sections.map((section) => {
                const isActive = section.id === activeSection;
                return (
                  <li key={section.id}>
                    <a
                      id={`settings-nav-${section.id}`}
                      href={settingsSectionHref(section.id)}
                      className="settings-index__tab"
                      aria-current={isActive ? 'page' : undefined}
                      tabIndex={isActive || activeSection === undefined ? 0 : -1}
                      onKeyDown={(event) => handleKeyDown(event, section.id)}
                      onClick={(event) => {
                        // Ctrl/Cmd-click va chuot giua van phai mo tab moi nhu mot lien ket that.
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                        event.preventDefault();
                        onChange(section.id);
                      }}
                    >
                      <strong>{section.label}</strong>
                      <small>{section.description}</small>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      {/* Vung noi dung duoc DAT TEN bang chinh muc dang mo, khong bang mot tieu de an them: moi
          man da co tieu de rieng, them mot cai nua chi tao ra hai tieu de trung ten. */}
      <div
        className="settings-panel"
        id={`settings-panel-${activeSection}`}
        role="region"
        aria-label={settingsSection(activeSection).label}
      >
        {children}
      </div>
    </div>
  );
}
