'use client';

import { useState } from 'react';

type Props = {
  onSend: (text: string) => void;
  samples: string[];
  isSending: boolean;
};

export function Composer({ onSend, samples, isSending }: Props) {
  const [text, setText] = useState('');

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="composer">
      <label htmlFor="msg">Giả lập tin nhắn đại lý (như dán tin từ nhóm Zalo)</label>
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
