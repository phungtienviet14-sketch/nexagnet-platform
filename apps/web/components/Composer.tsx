'use client';

import { useState } from 'react';
import type { DemoGroup } from '../lib/api';

type Props = {
  onSend: (input: { text: string; chatId?: string }) => void;
  samples: string[];
  groups: DemoGroup[];
  isSending: boolean;
};

export function Composer({ onSend, samples, groups, isSending }: Props) {
  const [text, setText] = useState('');
  const [chatId, setChatId] = useState('');

  // Mac dinh chon nhom dau tien khi danh sach da tai xong.
  const activeChatId = chatId || groups[0]?.chatId || '';

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ text: trimmed, chatId: activeChatId || undefined });
    setText('');
  }

  return (
    <div className="composer">
      <label htmlFor="msg">Giả lập tin nhắn đại lý (như dán tin từ nhóm Zalo)</label>

      {groups.length > 0 && (
        <select
          className="group-select"
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
        </select>
      )}

      <textarea
        id="msg"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="vd: @Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT"
      />
      <div className="chips">
        {samples.map((s) => (
          <button type="button" className="chip" key={s} onClick={() => setText(s)}>
            {s.length > 40 ? `${s.slice(0, 40)}…` : s}
          </button>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem' }}>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={isSending || text.trim().length === 0}
          onClick={handleSend}
        >
          {isSending ? 'AI đang xử lý…' : 'Gửi cho AI xử lý'}
        </button>
      </div>
    </div>
  );
}
