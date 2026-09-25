import type { OutboxItem } from '@netviet/driver-outbox';
import { useEffect, useState } from 'react';
import { useOutbox } from '../../outbox/OutboxProvider';
import type { QueueEntry } from './pending-actions';

/**
 * VIEC HIEN TRUONG DANG NAM TREN MAY — doc lai moi khi hang doi doi (`revision`).
 *
 * Chi muc `PROOF` (moc, chung tu, cho, bien nhan, phieu dau): diem vi tri nen khong gan voi mot nut.
 * `sentIds` la so DA GUI gan day — de xac nhan "Đã gửi" bang su that cua hang doi, khong bang doan.
 * Hang doi chua san sang (dang mo SQLite, hoac ban trinh duyet) -> rong, khong phai loi.
 */
export interface QueueView {
  readonly entries: readonly QueueEntry[];
  readonly sentIds: ReadonlySet<string>;
}

const EMPTY: QueueView = { entries: [], sentIds: new Set() };

function toEntry(item: OutboxItem): QueueEntry {
  return {
    clientEventId: item.clientEventId,
    state: item.state,
    lastError: item.lastError,
    capturedAt: item.capturedAt,
    payload: item.payload,
  };
}

export function useQueueView(): QueueView {
  const { listPending, listBlocked, listSent, revision, ready } = useOutbox();
  const [view, setView] = useState<QueueView>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listPending(), listBlocked(), listSent()])
      .then(([pending, blocked, sent]) => {
        if (cancelled) return;
        setView({
          entries: [...blocked, ...pending].filter((item) => item.kind === 'PROOF').map(toEntry),
          sentIds: new Set(sent.map((entry) => entry.clientEventId)),
        });
      })
      .catch(() => {
        if (!cancelled) setView(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [listPending, listBlocked, listSent, revision, ready]);

  return view;
}
