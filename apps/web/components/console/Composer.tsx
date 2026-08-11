'use client';

import { useState } from 'react';
import { useBranding } from '../../lib/branding';
import type { DemoGroup } from '../../lib/api';

type Props = {
  onSend: (input: { text: string; chatId?: string }) => void;
  samples: string[];
  groups: DemoGroup[];
  isSending: boolean;
};

/** Bom 1 tin GIA vao pipeline (luoi an toan khi demo). Nhan gon — huong dan o kich ban. */
export function Composer({ onSend, samples, groups, isSending }: Props) {
  const branding = useBranding();
  const [text, setText] = useState('');
  const [chatId, setChatId] = useState('');

  const activeChatId = chatId || groups[0]?.chatId || '';

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ text: trimmed, chatId: activeChatId || undefined });
    setText('');
  };

  return (
    <div className="composer">
      <label htmlFor="msg">Bơm tin thử</label>

      {groups.length > 0 && (
        <select
          id="grp"
          aria-label="Chọn nhóm Zalo"
          value={activeChatId}
          onChange={(e) => setChatId(e.target.value)}
        >
          {groups.map((g) => (
            <option key={g.chatId} value={g.chatId}>
              {g.name}
              {g.dealerName ? ` — ${g.dealerName}` : ''}
            </option>
          ))}
          {/* Nhom chua map -> demo Giam sat leo thang (senderType=unknown). */}
          <option value="zgr-nhom-la-demo">🔓 Nhóm lạ (chưa map đại lý)</option>
        </select>
      )}

      <textarea
        id="msg"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        placeholder={branding.composerPlaceholder}
      />

      {samples.length > 0 && (
        <div className="chips">
          {samples.map((s) => (
            <button type="button" className="sample-chip" key={s} onClick={() => setText(s)}>
              {s.length > 38 ? `${s.slice(0, 38)}…` : s}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: '0.55rem' }}
        disabled={isSending || text.trim().length === 0}
        onClick={handleSend}
      >
        {isSending ? 'AI đang xử lý…' : 'Gửi cho AI xử lý ▸'}
      </button>
    </div>
  );
}
