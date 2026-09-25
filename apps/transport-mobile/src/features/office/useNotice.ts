import { useCallback, useEffect, useState } from 'react';

/**
 * KET QUA mot quyet dinh hien o dau man roi tu tat — de mat nguoi dung thay "da xong" / "da duoc xu
 * ly truoc do" ma khong phai bam dong. Thong bao tu choi cua may chu KHONG di qua day: no nam trong
 * to truot cho toi khi nguoi dung doc.
 */
export interface OfficeNotice {
  readonly tone: 'live' | 'neutral';
  readonly title: string;
  readonly detail?: string;
}

const VISIBLE_MS = 8000;

export function useNotice(): readonly [OfficeNotice | null, (notice: OfficeNotice | null) => void] {
  const [notice, setNotice] = useState<OfficeNotice | null>(null);
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  const show = useCallback((next: OfficeNotice | null) => setNotice(next), []);
  return [notice, show] as const;
}

/** Bao cao cua to truot -> thong bao: "da xong" xanh, "da duoc xu ly truoc do" xam. */
export function noticeFromReport(report: {
  readonly alreadyDone: boolean;
  readonly message: string;
}): OfficeNotice {
  return report.alreadyDone
    ? { tone: 'neutral', title: 'Đã được xử lý trước đó', detail: report.message }
    : { tone: 'live', title: report.message };
}
