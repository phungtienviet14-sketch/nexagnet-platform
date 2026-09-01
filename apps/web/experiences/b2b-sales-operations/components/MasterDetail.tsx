'use client';

import type { ReactNode } from 'react';

/**
 * BO CUC DANH SACH — CHI TIET dung chung cho Hội thoại va Đơn hàng.
 *
 * Ba dieu bo cuc nay phai giu, va deu la ly do no ton tai thay vi duoc viet lai hai lan:
 *
 *   1. MOT ban phim di het duoc. Moi dong la mot `<button>` that — khong phai `<div onClick>` —
 *      nen Tab toi duoc, Enter/Space bam duoc va vien focus hien ra ma khong phai viet them gi.
 *   2. Dong dang chon duoc DOC RA, khong chi duoc to mau. `aria-current` noi cho trinh doc man
 *      hinh biet, va mot dai mau ben trai noi cho nguoi khong phan biet duoc mau biet — Issue
 *      #110 cam mang nghia bang mau don doc.
 *   3. Tren man hinh hep, DANH SACH va CHI TIET xep chong len nhau chu khong ep hai cot vao mot
 *      man 390px. Viec do do CSS lo (`b2b-workspace.css`), khong do JavaScript.
 */

export interface MasterDetailProps {
  /** Ten cua CAI DANH SACH, doc len phai ra nghia: "Danh sách hội thoại", khong phai "Danh sách". */
  readonly listLabel: string;
  readonly listHead?: ReactNode;
  readonly children: ReactNode;
  readonly detail: ReactNode;
}

export function MasterDetail({ listLabel, listHead, children, detail }: MasterDetailProps) {
  return (
    <div className="b2b-split">
      <section className="b2b-split__list" aria-label={listLabel}>
        {listHead ? <div className="b2b-split__listhead">{listHead}</div> : null}
        <ul className="b2b-picklist">{children}</ul>
      </section>
      <section className="b2b-split__detail" aria-label={`Chi tiết — ${listLabel}`}>
        {detail}
      </section>
    </div>
  );
}

export interface PickListItemProps {
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** Duong dan cua chinh muc nay — de bam giua chuot / mo tab moi van ra dung cho. */
  readonly href: string;
  readonly children: ReactNode;
}

export function PickListItem({ selected, onSelect, href, children }: PickListItemProps) {
  return (
    <li>
      <a
        className="b2b-pick"
        href={href}
        aria-current={selected ? 'true' : undefined}
        data-selected={selected || undefined}
        onClick={(event) => {
          // Giu nguyen thoi quen cua trinh duyet: Ctrl/Cmd/Shift + click van mo tab moi.
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onSelect();
        }}
      >
        {children}
      </a>
    </li>
  );
}
