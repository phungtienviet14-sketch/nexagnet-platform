'use client';

import type { ReactNode } from 'react';
import type { StatusTone } from '../customer-view';

/**
 * Nguyen lieu trinh bay cua rieng mien van tai.
 *
 * Gom bon thu nho vao mot tep thay vi bon tep mot dong: #161 §6 dan *"khong dung mot he thiet ke
 * chung thu hai trong task nay"*, va bon component nay chi co nghia trong ngu canh van tai (phu
 * hieu hai truc, bang co cot dinh danh nghiep vu). Chung khong phai primitive chung.
 */

export function PageHeader({
  title,
  summary,
  context,
  actions,
}: {
  readonly title: string;
  readonly summary?: string;
  /** Ngu canh dang xem — vd ky quy, lai xe dang chon. */
  readonly context?: ReactNode;
  /** MOT thao tac chinh. Neu thay minh muon nhieu, doc lai §7. */
  readonly actions?: ReactNode;
}) {
  return (
    <header className="tx-pagehead">
      <div className="tx-pagehead__text">
        <h1>{title}</h1>
        {summary === undefined ? null : <p className="tx-pagehead__summary">{summary}</p>}
        {context === undefined ? null : <div className="tx-pagehead__context">{context}</div>}
      </div>
      {actions === undefined ? null : <div className="tx-pagehead__actions">{actions}</div>}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  href,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | null;
  /** Co dia chi ⇒ con so la mot loi vao viec, khong phai mot trang tri. */
  readonly href?: string;
}) {
  const body = (
    <>
      <span className="tx-metric__label">{label}</span>
      <strong className="tx-metric__value">{value}</strong>
      {hint == null ? null : <span className="tx-metric__hint">{hint}</span>}
    </>
  );
  return href === undefined ? (
    <div className="tx-metric">{body}</div>
  ) : (
    <a className="tx-metric tx-metric--link" href={href}>
      {body}
    </a>
  );
}

/**
 * Phu hieu trang thai. Man Nhien lieu bay HAI cai canh nhau co chu dich — hai truc tra loi hai cau
 * hoi khac nhau va dong o hai thoi diem khac nhau, nen gop lai la mat thong tin.
 */
export function StatusBadge({
  label,
  tone,
  title,
}: {
  readonly label: string;
  readonly tone: StatusTone;
  readonly title?: string;
}) {
  return (
    <span className={`tx-badge tx-badge--${tone}`} title={title}>
      {label}
    </span>
  );
}

export interface DataColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
  /**
   * Cot mang DINH DANH NGHIEP VU (ma chuyen, bien so). Duoc dung lam `rowheader` de nguoi doc bang
   * tro ho tro va Playwright deu neo vao mot o co nghia, chu khong neo vao chi so dong.
   */
  readonly isRowHeader?: boolean;
  /** Cot so — can phai. */
  readonly isNumeric?: boolean;
}

/**
 * Bang du lieu. `overflow-x` nam TRONG khung bang, khong o than trang — #161 §7 cam trang tran
 * ngang o be rong laptop thuong.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelect,
}: {
  readonly caption: string;
  readonly columns: readonly DataColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly selectedKey?: string | null;
  readonly onSelect?: (row: Row) => void;
}) {
  return (
    <div className="tx-tablewrap">
      <table className="tx-table">
        <caption className="tx-table__caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.isNumeric === true ? 'tx-table__num' : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const isSelected = selectedKey != null && selectedKey === key;
            return (
              <tr
                key={key}
                data-selected={isSelected ? '' : undefined}
                onClick={onSelect === undefined ? undefined : () => onSelect(row)}
                className={onSelect === undefined ? undefined : 'tx-table__row--pick'}
              >
                {columns.map((column) =>
                  column.isRowHeader === true ? (
                    <th key={column.key} scope="row">
                      {column.render(row)}
                    </th>
                  ) : (
                    <td
                      key={column.key}
                      className={column.isNumeric === true ? 'tx-table__num' : undefined}
                    >
                      {column.render(row)}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cap nhan/gia tri cho khoi chi tiet. */
export function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="tx-detailrow">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
