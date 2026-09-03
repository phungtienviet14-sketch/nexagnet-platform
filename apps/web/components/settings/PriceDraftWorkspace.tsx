'use client';

import { useRef, useState } from 'react';
import { addRow } from '../../lib/price-period-view';
import { PRICE_COLUMNS, formatVnd } from '../../lib/price-rows';
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
 *
 * #144 them mot tang nua: khoi nay la khoi CHIEM UU THE (`data-price-dominant`) trong ca hai che
 * do sua va xem lai, va no mang `data-price-step` de CSS lam noi buoc dang lam. Ly do khoa nut
 * nam TRONG cung mot dai hanh dong voi cai nut — khong con la mot danh sach troi noi cach do vai
 * khoi, de nguoi doc phai tu noi hai thu lai voi nhau.
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

  const reviewing = state.mode === 'review';

  return (
    <section
      className="settings-price-work"
      aria-labelledby="settings-price-work-title"
      data-price-dominant="true"
      data-price-step={state.step}
      data-price-mode={state.mode}
    >
      <header className="settings-price-work__head">
        <p className="settings-eyebrow">Công việc đang làm</p>
        {/* O che do Xem lai, tieu de duoc dua con tro toi la tieu de cua chinh man quyet dinh —
            khong phai tieu de chung nay. Dung MOT phan tu mang `data-price-focus-target`. */}
        <h3
          id="settings-price-work-title"
          tabIndex={-1}
          data-price-focus-target={reviewing ? undefined : 'true'}
        >
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

            {/* DAI HANH DONG — ly do khoa va cai nut bi khoa nam trong cung mot khung.
                Truoc #144, danh sach "việc còn phải làm" o mot cho va cai nut mo/khoa o cho khac;
                nguoi van hanh phai tu doan hai thu do co lien quan den nhau khong. */}
            <div className="settings-price-actionbar">
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

              {/* KHOA vi trang thai -> thuoc tinh `disabled` that (khong bam duoc, va dung nhu
                  vay). KHOA vi dang cho may chu -> `aria-disabled` + chan trong handler.
                  Ly do: mot nut dang duoc tieu diem ma bi dat `disabled` thi trinh duyet NEM
                  tieu diem ve `<body>`. Nguoi dung ban phim bam "Lưu và làm sau" se mat cho
                  dang dung va phai Tab lai tu dau — dung dieu #144 cam ("no focus loss after
                  async save/validate"). */}
              <div className="settings-price-actions">
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  disabled={!state.saveForLater.enabled}
                  aria-disabled={busy || undefined}
                  aria-busy={saving || undefined}
                  onClick={() => {
                    if (!busy) onSaveForLater();
                  }}
                >
                  {saving ? 'Đang lưu…' : state.saveForLater.label}
                </button>
                <div className="settings-price-actions__primary">
                  <button
                    type="button"
                    className="settings-button settings-button--primary"
                    data-price-primary="true"
                    disabled={!state.checkAndContinue.enabled}
                    aria-disabled={busy || undefined}
                    aria-busy={checking || undefined}
                    aria-describedby={
                      state.checkAndContinue.hint ? 'settings-price-continue-hint' : undefined
                    }
                    onClick={() => {
                      if (!busy) onCheckAndContinue();
                    }}
                  >
                    {checking ? 'Đang lưu và kiểm tra…' : state.checkAndContinue.label}
                  </button>
                </div>
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
    <div className="settings-price-review-body">
      {/* Man Xem lai la mot QUYET DINH, nen no co tieu de rieng va con tro di thang toi day khi
          vao buoc nay — khong phai mot bang du lieu nua nam giua trang (#144 §5). */}
      <h4
        className="settings-price-review__title"
        tabIndex={-1}
        data-price-focus-target="true"
      >
        Xem lại trước khi kích hoạt
      </h4>
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

      {/* Duyet cai gi thi phai DOC duoc cai do: moi cot gia cua hop dong san pham hien tai deu co
          mat, khong chi rieng Don gia CTV. O nao chua co gia thi noi thang la "—", khong ve 0. */}
      <div className="settings-table-wrap">
        <table className="settings-table" aria-label="Bảng giá sẽ được kích hoạt">
          <thead>
            <tr>
              <th scope="col">Mặt hàng</th>
              {PRICE_COLUMNS.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
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
                  {PRICE_COLUMNS.map((column) => {
                    const value = row[column.key];
                    return (
                      <td key={column.key}>
                        <span className="settings-price-readonly">
                          {typeof value === 'number' ? formatVnd(value) : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="settings-price-actionbar">
        <div className="settings-price-actions">
          <button
            type="button"
            className="settings-button settings-button--quiet"
            disabled={busy}
            onClick={onBackToEdit}
          >
            {state.backToEdit.label}
          </button>
          <div className="settings-price-actions__primary">
            <button
              type="button"
              className="settings-button settings-button--primary"
              data-price-primary="true"
              disabled={busy || !state.activate.enabled}
              onClick={onActivate}
            >
              {state.activate.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
