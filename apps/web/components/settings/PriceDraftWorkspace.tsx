'use client';

import { useRef, useState } from 'react';
import { addRow } from '../../lib/price-period-view';
import { formatVnd } from '../../lib/price-rows';
import { PRICE_WORKFLOW_STEPS, type PriceWorkflowState } from '../../lib/price-workflow';
import { formatMonth } from '../../lib/settings-overview';
import type { PricePeriod, PricePeriodPrice } from '../../lib/settings';
import { PriceRowsEditor } from './PriceRowsEditor';
import { SettingsPanelState } from './SettingsPanelState';

/**
 * CONG VIEC DANG LAM — mot ban nhap, ba buoc, mot duong di.
 *
 * Man cu bay `Lưu bản nháp` va `Kiểm tra bảng giá` canh nhau roi de nguoi dung tu doan thu tu.
 * Doan sai thi may chu kiem tren dong DA LUU — tuc tren mot ban nhap 0 dong — va tra ve mot cau
 * tu choi khong lien quan gi den thu dang hien tren man hinh.
 *
 * O day chi con MOT duong: `Kiểm tra & tiếp tục` tu luu roi tu kiem, va nut Kich hoat KHONG TON
 * TAI cho toi khi may chu da noi la dat. Toan bo phan quyet dinh nam trong `resolvePriceWorkflow`
 * — component nay chi ve ra, khong tu suy dien them trang thai nao.
 */

type Props = {
  period: PricePeriod;
  state: PriceWorkflowState;
  rows: PricePeriodPrice[];
  onRowsChange: (rows: PricePeriodPrice[]) => void;
  catalogue: readonly string[];
  productNames: ReadonlyMap<string, string>;
  busy: boolean;
  saving: boolean;
  checking: boolean;
  removingSku: string | null;
  importText: string;
  onImportTextChange: (value: string) => void;
  onImportLoad: () => void;
  onRemoveRow: (sku: string) => void;
  onArchiveDraft: () => void;
  onSaveForLater: () => void;
  onCheckAndContinue: () => void;
  onBackToEdit: () => void;
  onActivate: () => void;
};

export function PriceDraftWorkspace({
  period,
  state,
  rows,
  onRowsChange,
  catalogue,
  productNames,
  busy,
  saving,
  checking,
  removingSku,
  importText,
  onImportTextChange,
  onImportLoad,
  onRemoveRow,
  onArchiveDraft,
  onSaveForLater,
  onCheckAndContinue,
  onBackToEdit,
  onActivate,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [focusNote, setFocusNote] = useState<string>();
  const month = formatMonth(period.validMonth ?? '');
  const testOnly = state.purpose === 'test-only';
  const invalidSkus = state.issues.flatMap((issue) => issue.skus);

  /** Dua con tro vao dung o dang thieu — thay vi bat nguoi ta do 19 dong tim dong sai. */
  const focusSku = (sku: string) => {
    const inputs = bodyRef.current?.querySelectorAll<HTMLInputElement>('input[data-price-sku]');
    const target = Array.from(inputs ?? []).find((input) => input.dataset.priceSku === sku);
    if (!target) {
      // Im lang khong lam gi la cach chac chan nhat de nguoi ta tuong nut hong.
      setFocusNote(`${sku} đang bị bộ lọc ẩn — bỏ lọc ở ô tìm kiếm để sửa.`);
      return;
    }
    setFocusNote(undefined);
    target.focus();
    target.scrollIntoView({ block: 'center' });
  };

  return (
    <section className="settings-price-work" aria-labelledby="settings-price-work-title">
      <header className="settings-price-work__head">
        <p className="settings-eyebrow">Công việc đang làm</p>
        <h3 id="settings-price-work-title">
          Bảng giá {month}
          {testOnly && <span className="settings-badge settings-badge--test">CHỈ ĐỂ CHẠY THỬ</span>}
        </h3>
        <p className="settings-muted">
          {testOnly
            ? 'Bản nháp chạy thử. Kích hoạt xong hệ thống vẫn báo là còn thiếu bảng giá chính thức của tháng này.'
            : 'Bản nháp chưa áp dụng cho đơn nào. Chỉ sau bước kích hoạt ở cuối, đơn mới mới dùng giá này.'}
        </p>
        {/* Bo han ban nhap dang lam — thao tac VONG DOI, khong phai mot buoc cua luong, nen no la
            mot dong chu nho chu khong dung ngang hang voi hai nut o duoi (#116 van phai lam duoc). */}
        <button
          type="button"
          className="settings-text-action settings-text-action--danger"
          disabled={busy}
          aria-label={`Lưu trữ bản nháp ${period.validMonth ?? ''}`}
          onClick={onArchiveDraft}
        >
          Lưu trữ bản nháp này
        </button>
      </header>

      <ol className="settings-steps" aria-label="Các bước hoàn thiện bảng giá">
        {PRICE_WORKFLOW_STEPS.map((entry) => (
          <li
            key={entry.step}
            aria-current={entry.step === state.step ? 'step' : undefined}
            data-state={
              entry.step < state.step ? 'done' : entry.step === state.step ? 'current' : 'todo'
            }
          >
            {entry.label}
          </li>
        ))}
      </ol>

      <div ref={bodyRef} className="settings-section-stack">
        {state.mode === 'review' ? (
          <ReviewBody
            state={state}
            month={month}
            productNames={productNames}
            testOnly={testOnly}
            busy={busy}
            onBackToEdit={onBackToEdit}
            onActivate={onActivate}
          />
        ) : (
          <>
            <PriceRowsEditor
              rows={rows}
              onChange={onRowsChange}
              catalogue={catalogue}
              productNames={productNames}
              invalidSkus={invalidSkus}
              disabled={busy}
              onRemove={onRemoveRow}
              removingSku={removingSku}
              onAdd={(sku) => onRowsChange(addRow(rows, sku))}
            />

            {state.check && !state.check.validation.valid && (
              <SettingsPanelState
                tone="error"
                title={
                  state.check.stale
                    ? 'Kết quả kiểm tra trước đó — bạn vừa sửa lại bảng giá'
                    : 'Chưa kích hoạt được — bảng giá còn thiếu'
                }
                detail={
                  state.check.stale
                    ? `${state.check.validation.errors.join('; ')} — bấm Kiểm tra & tiếp tục để kiểm lại nội dung vừa sửa.`
                    : state.check.validation.errors.join('; ')
                }
              />
            )}

            {state.check?.validation.valid && state.check.stale && (
              <SettingsPanelState
                tone="warning"
                title="Cần kiểm tra lại"
                detail="Bảng giá đã đổi sau lần kiểm tra vừa rồi, nên kết quả cũ không còn đúng với nội dung hiện tại. Bấm Kiểm tra & tiếp tục để kiểm lại trước khi kích hoạt."
              />
            )}

            {state.issues.length > 0 && (
              // MOT cho duy nhat noi vi sao chua di tiep duoc. Nhac lai cung mot cau o duoi nut
              // nua thi nguoi doc phai tu hoi hai cho co noi cung mot chuyen khong.
              <div
                className="settings-price-issues"
                id="settings-price-continue-hint"
                role="group"
                aria-label="Việc còn phải làm"
              >
                <ul>
                  {state.issues.map((issue) => (
                    <li key={issue.code}>
                      <span>{issue.message}</span>
                      {issue.skus[0] && (
                        <button
                          type="button"
                          className="settings-text-action"
                          onClick={() => focusSku(issue.skus[0]!)}
                        >
                          Sửa lại
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {focusNote && <small className="settings-muted">{focusNote}</small>}
              </div>
            )}

            <div className="settings-price-actions">
              <button
                type="button"
                className="settings-button settings-button--quiet"
                disabled={busy || !state.saveForLater.enabled}
                onClick={onSaveForLater}
              >
                {saving ? 'Đang lưu…' : state.saveForLater.label}
              </button>
              <div className="settings-price-actions__primary">
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={busy || !state.checkAndContinue.enabled}
                  aria-describedby={
                    state.checkAndContinue.hint ? 'settings-price-continue-hint' : undefined
                  }
                  onClick={onCheckAndContinue}
                >
                  {checking ? 'Đang lưu và kiểm tra…' : state.checkAndContinue.label}
                </button>
              </div>
            </div>

            {/* Nhap hang loat lui ve day: khach binh thuong khong bao gio phai cham vao (#117 §4.4). */}
            <details className="settings-bulk-import">
              <summary>Nâng cao · Nhập hàng loạt</summary>
              <label className="settings-field">
                <span>Dán dữ liệu bảng giá đã xuất từ hệ thống khác</span>
                <textarea
                  rows={6}
                  value={importText}
                  onChange={(event) => onImportTextChange(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="settings-button settings-button--quiet"
                onClick={onImportLoad}
              >
                Nạp vào bảng
              </button>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * XEM LAI — doc lai dung thu se duoc kich hoat, khong sua duoc gi.
 *
 * `state.reviewRows` la ban DA LUU va DA KIEM, khong phai mang dang soan tren man hinh: neu hai
 * cai lech nhau thi `resolvePriceWorkflow` da khong cho vao day.
 */
function ReviewBody({
  state,
  month,
  productNames,
  testOnly,
  busy,
  onBackToEdit,
  onActivate,
}: {
  state: PriceWorkflowState;
  month: string;
  productNames: ReadonlyMap<string, string>;
  testOnly: boolean;
  busy: boolean;
  onBackToEdit: () => void;
  onActivate: () => void;
}) {
  return (
    <div className="settings-section-stack">
      <SettingsPanelState
        tone={testOnly ? 'warning' : 'success'}
        title={testOnly ? 'Bảng giá chạy thử — đã kiểm tra xong' : 'Đã kiểm tra xong'}
        detail={
          testOnly
            ? `Đây KHÔNG phải bảng giá chính thức: kích hoạt xong hệ thống vẫn báo là còn thiếu bảng giá ${month}, và cổng “đủ điều kiện chạy thật” vẫn đỏ.`
            : `Đọc lại một lượt rồi mới kích hoạt. Đây đúng là nội dung đã được lưu và kiểm, và cũng là nội dung sẽ áp dụng cho mọi đơn mới của ${month}.`
        }
      />

      <dl className="settings-dialog__facts settings-price-review">
        <dt>Loại bảng giá</dt>
        <dd>{testOnly ? 'Chỉ để chạy thử (UAT)' : 'Bảng giá chính thức'}</dd>
        <dt>Áp dụng cho</dt>
        <dd>{month}</dd>
        <dt>Số mặt hàng</dt>
        <dd>{state.reviewRows.length}</dd>
      </dl>

      <div className="settings-table-wrap">
        <table className="settings-table" aria-label="Bảng giá sẽ được kích hoạt">
          <thead>
            <tr>
              <th scope="col">Mặt hàng</th>
              <th scope="col">Đơn giá CTV</th>
            </tr>
          </thead>
          <tbody>
            {state.reviewRows.map((row) => {
              const name = productNames.get(row.sku);
              return (
                <tr key={row.sku}>
                  <th scope="row">
                    {name && name !== row.sku && <span>{name}</span>}
                    <code>{row.sku}</code>
                  </th>
                  <td>
                    <span className="settings-price-readonly">{formatVnd(row.wholesale)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="settings-price-actions">
        <button
          type="button"
          className="settings-button settings-button--quiet"
          disabled={busy}
          onClick={onBackToEdit}
        >
          {state.backToEdit.label}
        </button>
        <button
          type="button"
          className="settings-button settings-button--primary"
          disabled={busy || !state.activate.enabled}
          onClick={onActivate}
        >
          {state.activate.label}
        </button>
      </div>
    </div>
  );
}
