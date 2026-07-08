'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { BroadcastResult } from '@ultty/shared';
import { useState } from 'react';
import { api } from '../../lib/api';

/**
 * View phu "Khuyen mai" (KH2): Sale soan -> xem truoc -> xac nhan gui hang loat.
 * La cong cu Sale bam (khong phai AI tu dong). Backend tu gan nhan "Tin tu dong".
 */
export function BroadcastPanel() {
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: api.groups });
  const groups = groupsQ.data ?? [];

  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<BroadcastResult | null>(null);

  const targetIds = selected.length > 0 ? selected : undefined;
  const previewM = useMutation({
    mutationFn: () => api.broadcast({ text: text.trim(), groupChatIds: targetIds, dryRun: true }),
    onSuccess: (r) => setPreview(r),
  });
  const sendM = useMutation({
    mutationFn: () => api.broadcast({ text: text.trim(), groupChatIds: targetIds, dryRun: false }),
  });

  const resetFlow = () => {
    setPreview(null);
    previewM.reset();
    sendM.reset();
  };
  const handleText = (value: string) => {
    setText(value);
    resetFlow();
  };
  const selectAll = () => {
    setSelected([]);
    resetFlow();
  };
  const toggleGroup = (chatId: string) => {
    setSelected((s) => (s.includes(chatId) ? s.filter((x) => x !== chatId) : [...s, chatId]));
    resetFlow();
  };

  const result = sendM.data;
  const actionError = previewM.error ?? sendM.error;
  const targetCount = targetIds ? targetIds.length : groups.length;
  const isAll = selected.length === 0;
  const canPreview = text.trim().length > 0 && !previewM.isPending && !sendM.isPending;

  return (
    <div className="bc-wrap">
      <div className="composer">
        <label htmlFor="promo">Nội dung khuyến mãi</label>
        <textarea
          id="promo"
          value={text}
          onChange={(e) => handleText(e.target.value)}
          placeholder="vd: 🎉 Tháng 7 giảm 10% toàn bộ đồ gia dụng, đặt trước 15/7…"
        />
        <div className="chips" style={{ marginTop: '0.7rem' }}>
          <button type="button" className={`sample-chip ${isAll ? '' : ''}`} onClick={selectAll} aria-pressed={isAll}>
            Tất cả ({groups.length})
          </button>
          {groups.map((g) => (
            <button
              type="button"
              key={g.chatId}
              className="sample-chip"
              aria-pressed={selected.includes(g.chatId)}
              style={selected.includes(g.chatId) ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              onClick={() => toggleGroup(g.chatId)}
            >
              {g.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: '0.7rem' }}
          disabled={!canPreview}
          onClick={() => previewM.mutate()}
        >
          {previewM.isPending ? 'Đang chuẩn bị…' : `Xem trước (${targetCount} nhóm)`}
        </button>
      </div>

      {actionError && (
        <div className="error-banner" role="alert">
          ⚠ {actionError.message}
        </div>
      )}

      {preview && !result && (
        <div className="bc-panel">
          <p className="col-label" style={{ padding: '0.8rem 1rem 0' }}>
            Xem trước — sẽ gửi tới {preview.total} nhóm
          </p>
          <pre className="bc-text">{preview.labeledText}</pre>
          <ul className="bc-groups">
            {preview.results.map((r) => (
              <li key={r.chatId}>{r.groupName ?? r.chatId}</li>
            ))}
          </ul>
          <div className="oc-actions">
            <button type="button" className="btn btn-ghost" onClick={resetFlow} disabled={sendM.isPending}>
              Sửa lại
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => sendM.mutate()}
              disabled={sendM.isPending || preview.total === 0}
            >
              {sendM.isPending ? 'Đang gửi…' : `Xác nhận gửi ${preview.total} nhóm`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="bc-panel">
          <p className="col-label" style={{ padding: '0.8rem 1rem 0' }}>
            Kết quả: {result.sent}/{result.total} nhóm thành công
            {result.failed > 0 ? ` · ${result.failed} lỗi` : ''}
          </p>
          <ul className="bc-groups">
            {result.results.map((r) => (
              <li key={r.chatId} className={r.ok ? 'ok' : 'fail'}>
                {r.ok ? '✓' : '✕'} {r.groupName ?? r.chatId}
                {r.error ? ` — ${r.error}` : ''}
              </li>
            ))}
          </ul>
          <div style={{ padding: '0 1rem 1rem' }}>
            <button type="button" className="btn btn-ghost btn-block" onClick={resetFlow}>
              Soạn tin mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
