'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { BroadcastResult } from '@ultty/shared';
import { api } from '../lib/api';

/**
 * Tab Khuyen mai (KH2): Sale soan -> xem truoc -> xac nhan gui hang loat vao cac nhom.
 * La cong cu Sale bam (khong phai AI tu dong); backend tu gan nhan "Tin tu dong".
 */
export function BroadcastTab() {
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: api.groups });
  const groups = groupsQ.data ?? [];

  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>([]); // rong = tat ca nhom
  const [preview, setPreview] = useState<BroadcastResult | null>(null);

  const targetIds = selected.length > 0 ? selected : undefined;

  const previewM = useMutation({
    mutationFn: () => api.broadcast({ text: text.trim(), groupChatIds: targetIds, dryRun: true }),
    onSuccess: (r) => setPreview(r),
  });
  const sendM = useMutation({
    mutationFn: () => api.broadcast({ text: text.trim(), groupChatIds: targetIds, dryRun: false }),
  });

  // Sua noi dung / doi nhom -> huy xem truoc + ket qua cu (tranh gui nham ban cu).
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
    <>
      <div className="kv-note">
        📣 Gửi tin khuyến mãi vào các nhóm Zalo. Quy trình <b>soạn → xem trước → xác nhận</b>; mỗi tin
        được tự gắn nhãn “Tin tự động từ Bot Ultty”. Có giãn cách chống spam.
      </div>

      <div className="composer">
        <label htmlFor="promo">Nội dung khuyến mãi</label>
        <textarea
          id="promo"
          value={text}
          onChange={(e) => handleText(e.target.value)}
          placeholder="vd: 🎉 Tháng 7 giảm 10% toàn bộ đồ gia dụng, đặt trước 15/7…"
        />

        <div className="bc-target-label">Gửi tới nhóm</div>
        <div className="chips">
          <button type="button" className={`chip ${isAll ? 'chip-active' : ''}`} onClick={selectAll}>
            Tất cả ({groups.length})
          </button>
          {groups.map((g) => (
            <button
              type="button"
              key={g.chatId}
              className={`chip ${selected.includes(g.chatId) ? 'chip-active' : ''}`}
              onClick={() => toggleGroup(g.chatId)}
            >
              {g.name}
            </button>
          ))}
        </div>

        <div style={{ marginTop: '0.7rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!canPreview}
            onClick={() => previewM.mutate()}
          >
            {previewM.isPending ? 'Đang chuẩn bị…' : `Xem trước (${targetCount} nhóm)`}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="error-banner" role="alert">
          ⚠ {actionError.message}
        </div>
      )}

      {preview && !result && (
        <div className="bc-panel">
          <div className="section-title">Xem trước — sẽ gửi tới {preview.total} nhóm</div>
          <pre className="bc-text">{preview.labeledText}</pre>
          <ul className="bc-groups">
            {preview.results.map((r) => (
              <li key={r.chatId}>{r.groupName ?? r.chatId}</li>
            ))}
          </ul>
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={resetFlow}
              disabled={sendM.isPending}
            >
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
          <div className="section-title">
            Kết quả: {result.sent}/{result.total} nhóm thành công
            {result.failed > 0 ? ` · ${result.failed} lỗi` : ''}
          </div>
          <ul className="bc-groups">
            {result.results.map((r) => (
              <li key={r.chatId} className={r.ok ? 'bc-ok' : 'bc-fail'}>
                {r.ok ? '✓' : '✕'} {r.groupName ?? r.chatId}
                {r.error ? ` — ${r.error}` : ''}
              </li>
            ))}
          </ul>
          <div className="composer">
            <button type="button" className="btn btn-ghost btn-block" onClick={resetFlow}>
              Soạn tin mới
            </button>
          </div>
        </div>
      )}
    </>
  );
}
