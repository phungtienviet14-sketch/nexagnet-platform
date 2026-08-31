'use client';

import type { ReactNode } from 'react';

/**
 * BA TRANG THAI cua moi trang trong be mat khach — Issue #107 §9.7.
 *
 * Gom vao mot cho vi chung phai GIONG NHAU o moi muc: mot san pham ma cho nay bao "Đang tải…", cho
 * kia quay mot vong tron, cho khac im lang la mot san pham nguoi dung khong hoc duoc gi sau lan
 * dau. Va vi cau chu cua ba trang thai nay la noi de lo ky thuat nhat — "fetch failed", "500" —
 * nen chung duoc viet MOT lan, bang tieng nguoi.
 */

export type SectionStateTone = 'loading' | 'empty' | 'error' | 'planned';

export interface SectionStateProps {
  readonly tone: SectionStateTone;
  readonly title: string;
  readonly detail: string;
  readonly action?: ReactNode;
}

export function SectionState({ tone, title, detail, action }: SectionStateProps) {
  return (
    <div
      className={`b2b-state b2b-state--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-busy={tone === 'loading' || undefined}
    >
      <p className="b2b-state__title">{title}</p>
      <p className="b2b-state__detail">{detail}</p>
      {action ? <div className="b2b-state__action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ what }: { what: string }) {
  return (
    <SectionState tone="loading" title={`Đang tải ${what}…`} detail="Vui lòng đợi trong giây lát." />
  );
}

/**
 * Loi phai doc duoc boi nguoi KHONG doc log.
 *
 * CO Y khong in `error.message` ra man hinh: chuoi do den tu `fetch`/Nest va thuong la
 * "Failed to fetch" hoac mot ma trang thai — vo nghia voi nguoi dung, doi khi con lo duong dan noi
 * bo. Nguoi van hanh van doc duoc nguyen van no o be mat noi bo.
 */
export function ErrorState({ what }: { what: string }) {
  return (
    <SectionState
      tone="error"
      title={`Chưa tải được ${what}`}
      detail="Kết nối tới hệ thống đang gián đoạn. Thử tải lại trang; nếu vẫn vậy, báo quản trị viên."
    />
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <SectionState tone="empty" title={title} detail={detail} />;
}

/**
 * RANH GIOI TRANG cho muc chua mo trong ban nay.
 *
 * Issue #107 §3: "Do not fill unfinished sections with fake business data." Mot trang noi thang no
 * chua mo la mot trang trung thuc; mot trang do day so lieu minh hoa la mot loi hua sai.
 */
export function PlannedSectionState({ label, detail }: { label: string; detail: string }) {
  return <SectionState tone="planned" title={`${label} chưa mở trong bản này`} detail={detail} />;
}

export function StatPanel({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="b2b-stat">
      <p className="b2b-stat__label">{label}</p>
      <p className="b2b-stat__value">{value}</p>
      {hint ? <p className="b2b-stat__hint">{hint}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="b2b-panel" aria-label={title}>
      <header className="b2b-panel__head">
        <div>
          <h2 className="b2b-panel__title">{title}</h2>
          {description ? <p className="b2b-panel__description">{description}</p> : null}
        </div>
        {aside ? <div className="b2b-panel__aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}
