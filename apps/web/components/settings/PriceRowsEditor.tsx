'use client';

import { useMemo, useState } from 'react';
import {
  PRICE_COLUMNS,
  formatVnd,
  updatePriceCell,
  type PriceColumnKey,
} from '../../lib/price-rows';
import type { PricePeriodPrice } from '../../lib/settings';

/**
 * Bang sua gia theo tung mat hang.
 *
 * Hai dieu man nay phai lam duoc ma ban truoc khong lam duoc:
 *  - THEM mot mat hang ma khong phai dan JSON (#117 §4.4);
 *  - XOA mot mat hang, va xoa THAT — `onRemove` goi thang API xoa dong nhap, vi bo dong khoi mang
 *    roi bam Luu se khong xoa duoc gi ca (`applyImport()` chi upsert, khong prune — Issue #116).
 *
 * Chi ky NHAP moi co hai nut do. Ky dang ap dung va ky da luu tru la bang chi doc.
 */

type Props = {
  rows: readonly PricePeriodPrice[];
  onChange: (rows: PricePeriodPrice[]) => void;
  /** Chi truyen khi ky la NHAP. Khong co ham nay thi khong co nut xoa. */
  onRemove?: (sku: string) => void;
  /** Ma dang bi xoa — de tat nut va tranh bam hai lan. */
  removingSku?: string | null;
  onAdd?: (sku: string) => void;
  /** Ma hang trong danh muc de goi y — khach chon tu danh sach thay vi go tay. */
  catalogue?: readonly string[];
  readOnly?: boolean;
  disabled?: boolean;
};

export function PriceRowsEditor({
  rows,
  onChange,
  onRemove,
  removingSku = null,
  onAdd,
  catalogue = [],
  readOnly = false,
  disabled = false,
}: Props) {
  const [filterQuery, setFilterQuery] = useState('');
  const [newSku, setNewSku] = useState('');

  const indexedRows = useMemo(
    () => rows.map((row, originalIndex) => ({ row, originalIndex })),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return indexedRows;
    return indexedRows.filter(({ row }) => row.sku.toLowerCase().includes(query));
  }, [indexedRows, filterQuery]);

  const missingFromDraft = useMemo(() => {
    const present = new Set(rows.map((row) => row.sku));
    return catalogue.filter((sku) => !present.has(sku));
  }, [catalogue, rows]);

  const updateCell = (originalIndex: number, key: PriceColumnKey, raw: string) => {
    onChange(updatePriceCell(rows, originalIndex, key, raw));
  };

  const submitAdd = () => {
    const sku = newSku.trim();
    if (!sku || !onAdd) return;
    onAdd(sku);
    setNewSku('');
  };

  const addControl = onAdd && !readOnly && (
    <div className="settings-price-add">
      <label className="settings-field settings-price-add__field">
        <span>Thêm mặt hàng vào bảng giá</span>
        <input
          type="text"
          list="settings-price-catalogue"
          value={newSku}
          disabled={disabled}
          placeholder="Chọn hoặc gõ mã mặt hàng"
          onChange={(event) => setNewSku(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submitAdd();
          }}
        />
      </label>
      <datalist id="settings-price-catalogue">
        {missingFromDraft.map((sku) => (
          <option key={sku} value={sku} />
        ))}
      </datalist>
      <button
        type="button"
        className="settings-button settings-button--quiet"
        disabled={disabled || newSku.trim().length === 0}
        onClick={submitAdd}
      >
        Thêm vào bảng
      </button>
      {missingFromDraft.length > 0 && (
        <small className="settings-muted">
          Còn {missingFromDraft.length} mặt hàng trong danh mục chưa có trong bảng giá này.
        </small>
      )}
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="settings-section-stack">
        <p className="settings-muted">
          Bảng giá này chưa có mặt hàng nào. Thêm từng mặt hàng bên dưới, hoặc quay lại chọn “Tạo
          bản nháp từ một kỳ trước” để lấy sẵn danh sách rồi sửa.
        </p>
        {addControl}
      </div>
    );
  }

  return (
    <div className="settings-section-stack">
      <div className="settings-subheading settings-price-toolbar">
        <div className="settings-price-toolbar__search">
          <label className="settings-field settings-price-filter">
            <span className="settings-visually-hidden">Tìm mặt hàng</span>
            <input
              type="search"
              placeholder="Tìm nhanh mã mặt hàng"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
            />
          </label>
          {filterQuery && (
            <button
              type="button"
              className="settings-text-action"
              onClick={() => setFilterQuery('')}
            >
              Bỏ lọc
            </button>
          )}
        </div>
        <small className="settings-muted">
          Hiển thị <b>{filteredRows.length}</b> / {rows.length} mặt hàng
        </small>
      </div>

      <div className="settings-table-wrap">
        <table className="settings-table" aria-label="Bảng giá theo mặt hàng">
          <thead>
            <tr>
              <th scope="col">Mặt hàng</th>
              {PRICE_COLUMNS.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                  {column.required && <abbr title="Bắt buộc"> *</abbr>}
                </th>
              ))}
              {onRemove && !readOnly && <th scope="col">Bỏ khỏi bảng</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ row, originalIndex }) => (
              <tr key={row.id ?? row.sku}>
                <th scope="row">
                  <code>{row.sku}</code>
                </th>
                {PRICE_COLUMNS.map((column) => {
                  const value = row[column.key];
                  return (
                    <td key={column.key}>
                      {readOnly ? (
                        <span className="settings-price-readonly">{formatVnd(value)}</span>
                      ) : (
                        <>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            inputMode="numeric"
                            disabled={disabled}
                            aria-label={`${column.label} của ${row.sku}`}
                            value={value === null || value === undefined ? '' : value}
                            onChange={(event) =>
                              updateCell(originalIndex, column.key, event.target.value)
                            }
                          />
                          <small className="settings-cell-meta">{formatVnd(value)}</small>
                        </>
                      )}
                    </td>
                  );
                })}
                {onRemove && !readOnly && (
                  <td className="settings-table__action">
                    <button
                      type="button"
                      className="settings-button settings-button--danger-quiet"
                      disabled={disabled || removingSku === row.sku}
                      aria-label={`Xóa ${row.sku} khỏi bản nháp`}
                      onClick={() => onRemove(row.sku)}
                    >
                      {removingSku === row.sku ? 'Đang xóa…' : 'Xóa'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={PRICE_COLUMNS.length + (onRemove && !readOnly ? 2 : 1)}
                  className="settings-table__empty"
                >
                  Không có mặt hàng nào khớp với “{filterQuery}”
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addControl}
    </div>
  );
}
