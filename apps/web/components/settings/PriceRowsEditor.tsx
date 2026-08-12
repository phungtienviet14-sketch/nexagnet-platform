'use client';

import {
  PRICE_COLUMNS,
  formatVnd,
  updatePriceCell,
  type PriceColumnKey,
} from '../../lib/price-rows';
import type { PricePeriodPrice } from '../../lib/settings';

/**
 * Bang sua gia theo tung SKU.
 *
 * Truoc day man ky gia bat Sale DAN JSON vao mot textarea — khong dung duoc voi nguoi khong ky
 * thuat, ma CLAUDE.md thi chot "khach chua co IT noi bo: van hanh duoc boi nguoi non-technical".
 * O day moi o gia la mot o nhap so; duong dan JSON van con nhung lui ve nhap hang loat.
 *
 * Thuan phan hien thi: khong goi API, khong giu state — cha so huu `rows`.
 */

type Props = {
  rows: readonly PricePeriodPrice[];
  onChange: (rows: PricePeriodPrice[]) => void;
  disabled?: boolean;
};

export function PriceRowsEditor({ rows, onChange, disabled = false }: Props) {
  const updateCell = (index: number, key: PriceColumnKey, raw: string) => {
    onChange(updatePriceCell(rows, index, key, raw));
  };

  if (rows.length === 0) {
    return (
      <p className="settings-muted">
        Kỳ này chưa có dòng giá nào. Dùng “Copy kỳ đã chọn thành nháp” để lấy bảng giá kỳ trước làm
        mẫu, rồi sửa lại từng ô.
      </p>
    );
  }

  return (
    <div className="settings-table-wrap">
      <table className="settings-table" aria-label="Bảng giá theo SKU">
        <thead>
          <tr>
            <th scope="col">Mã SP</th>
            {PRICE_COLUMNS.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
                {column.required && <abbr title="Bắt buộc"> *</abbr>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? row.sku}>
              <th scope="row">{row.sku}</th>
              {PRICE_COLUMNS.map((column) => {
                const value = row[column.key];
                return (
                  <td key={column.key}>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      inputMode="numeric"
                      disabled={disabled}
                      aria-label={`${column.label} của ${row.sku}`}
                      value={value === null || value === undefined ? '' : value}
                      onChange={(event) => updateCell(index, column.key, event.target.value)}
                    />
                    <small className="settings-cell-meta">{formatVnd(value)}</small>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
