'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  PRICE_PERIOD_KIND_LABELS,
  activateConfirmation,
  addRow,
  archiveConfirmation,
  buildPricePeriodBoard,
  canArchivePeriod,
  classifyPricePeriod,
  isPeriodInEffect,
  isTestOnlyPeriod,
  pricePeriodOrigin,
  removeRow,
  removeRowConfirmation,
  validatePricePeriodRows,
  type HighImpactConfirmation,
  type PricePeriodPlan,
} from '../../lib/price-period-view';
import { formatMonth } from '../../lib/settings-overview';
import { settingsApi, type PricePeriod, type PricePeriodPrice } from '../../lib/settings';
import { ConfirmDialog } from './ConfirmDialog';
import { PriceRowsEditor } from './PriceRowsEditor';
import { PricePeriodWizard } from './PricePeriodWizard';
import { SettingsPanelState } from './SettingsPanelState';

/**
 * Man BANG GIA — ba khai niem tach roi han nhau, va mot duong tao co dan duong.
 *
 * Xem `lib/price-period-view.ts` de biet vi sao: mot cai `<select>` gop ca ba loai ky da tung dan
 * den viec kich hoat nham bang gia thang 7 thanh bang gia chinh thuc thang 9 (Issue #114).
 */

type Props = {
  dataClassificationTest: boolean;
  canConfigure: boolean;
};

type PendingConfirmation = {
  confirmation: HighImpactConfirmation;
  tone: 'danger' | 'primary';
  run: () => Promise<unknown>;
};

export function PricePeriodsSettings({ dataClassificationTest, canConfigure }: Props) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['settings-price-periods'],
    queryFn: settingsApi.pricePeriods,
  });
  const catalogueQuery = useQuery({
    queryKey: ['settings-source-truth'],
    queryFn: settingsApi.sourceTruth,
  });

  const view = query.data;
  const board = useMemo(() => (view ? buildPricePeriodBoard(view) : null), [view]);
  const catalogue = useMemo(
    () =>
      (catalogueQuery.data ?? [])
        .find((section) => section.resource === 'products')
        ?.rows.map((row) => row.code ?? row.id) ?? [],
    [catalogueQuery.data],
  );

  const [selectedId, setSelectedId] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [rows, setRows] = useState<PricePeriodPrice[]>([]);
  const [notice, setNotice] = useState<string>();
  const [localError, setLocalError] = useState<string>();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [removingSku, setRemovingSku] = useState<string | null>(null);
  const [importText, setImportText] = useState('[]');

  // Ky dang mo: uu tien ky nguoi dung chon, roi den ban nhap dau tien — ban nhap la thu duy nhat
  // con sua duoc, nen mo san mot ky chi doc chi lam nguoi ta tuong minh khong sua duoc gi.
  const selected: PricePeriod | undefined = useMemo(() => {
    if (!view) return undefined;
    if (selectedId) return view.periods.find((period) => period.id === selectedId);
    return board?.drafts[0] ?? board?.official ?? view.periods[0];
  }, [board, selectedId, view]);

  const isDraft = selected?.status === 'draft';
  const draftId = isDraft ? (selected?.id ?? '') : '';

  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    const current = selected.prices.map(({ id: _id, ...row }) => row);
    setRows(current);
    setImportText(JSON.stringify(current, null, 2));
    setLocalError(undefined);
  }, [selected]);

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['settings-price-periods'] });
    await client.invalidateQueries({ queryKey: ['settings-summary'] });
    await client.invalidateQueries({ queryKey: ['settings', 'readiness'] });
  };

  const create = useMutation({
    mutationFn: (plan: PricePeriodPlan) =>
      plan.api === 'copy'
        ? settingsApi.copyPricePeriod(plan.sourcePeriodId!, plan.validMonth)
        : settingsApi.createPricePeriod(plan.validMonth, plan.note, plan.testOnly),
    onSuccess: (period) => {
      setSelectedId(period.id);
      setWizardOpen(false);
      setNotice(
        isTestOnlyPeriod(period)
          ? `Đã tạo bản nháp CHỈ ĐỂ CHẠY THỬ cho ${formatMonth(period.validMonth ?? '')}. Bản nháp chưa áp dụng cho đơn nào.`
          : `Đã tạo bản nháp cho ${formatMonth(period.validMonth ?? '')} với ${period.prices.length} mặt hàng. Bản nháp chưa áp dụng cho đơn nào.`,
      );
      void refresh();
    },
  });

  const apply = useMutation({
    mutationFn: () => settingsApi.applyPriceImport(draftId, rows, true),
    onSuccess: () => {
      setNotice('Đã lưu bản nháp. Bảng giá đang áp dụng chưa thay đổi.');
      void refresh();
    },
  });
  const validate = useMutation({ mutationFn: () => settingsApi.validatePricePeriod(draftId) });
  const activate = useMutation({ mutationFn: () => settingsApi.activatePricePeriod(draftId) });
  const archive = useMutation({ mutationFn: (id: string) => settingsApi.archivePricePeriod(id) });
  const removeDraftRow = useMutation({
    mutationFn: (sku: string) => settingsApi.removeDraftPriceRow(draftId, sku),
  });

  const mutationError =
    create.error ??
    apply.error ??
    validate.error ??
    activate.error ??
    archive.error ??
    removeDraftRow.error;

  const askArchive = (period: PricePeriod) => {
    if (!board) return;
    setPending({
      confirmation: archiveConfirmation(period, board),
      tone: 'danger',
      run: async () => {
        await archive.mutateAsync(period.id);
        setSelectedId('');
        setNotice(
          period.status === 'draft'
            ? `Đã lưu trữ bản nháp ${formatMonth(period.validMonth ?? '')}.`
            : `Đã lưu trữ bảng giá ${formatMonth(period.validMonth ?? '')}. Kỳ này thôi áp dụng từ bây giờ.`,
        );
        await refresh();
      },
    });
  };

  const askRemoveRow = (sku: string) => {
    setPending({
      confirmation: removeRowConfirmation(sku, rows.length - 1),
      tone: 'danger',
      run: async () => {
        setRemovingSku(sku);
        try {
          await removeDraftRow.mutateAsync(sku);
          // Bo khoi state NGAY, nhung nguon su that la lan tai lai ben duoi: dong da bi xoa han
          // khoi co so du lieu chu khong chi bien khoi man hinh (Issue #116 acceptance 3-4).
          setRows((current) => removeRow(current, sku));
          setNotice(`Đã xóa ${sku} khỏi bản nháp.`);
          await refresh();
        } finally {
          setRemovingSku(null);
        }
      },
    });
  };

  const askActivate = async () => {
    if (!selected || !board) return;
    const purpose = isTestOnlyPeriod(selected) ? 'test-only' : 'official';
    const errors = validatePricePeriodRows(purpose, rows);
    if (errors.length > 0) {
      setLocalError(errors.join(' '));
      return;
    }
    setLocalError(undefined);
    try {
      await apply.mutateAsync();
      const result = await validate.mutateAsync();
      if (!result.valid) {
        setLocalError(`Chưa kích hoạt được: ${result.errors.join('; ')}`);
        return;
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Không lưu được bản nháp.');
      return;
    }
    setPending({
      confirmation: activateConfirmation(selected, rows, board),
      tone: 'primary',
      run: async () => {
        const activated = await activate.mutateAsync();
        setNotice(
          `Đã kích hoạt bảng giá ${formatMonth(activated.validMonth ?? '')}${
            isTestOnlyPeriod(activated) ? ' (chỉ để chạy thử)' : ''
          }.`,
        );
        await refresh();
      },
    });
  };

  const runPending = async () => {
    if (!pending) return;
    try {
      await pending.run();
      setPending(null);
    } catch (error) {
      setPending(null);
      setLocalError(error instanceof Error ? error.message : 'Không thực hiện được thao tác.');
    }
  };

  if (query.isPending) {
    return <SettingsPanelState title="Đang tải bảng giá…" detail="Đọc các kỳ giá đã lưu." />;
  }
  if (query.error || !view || !board) {
    return (
      <SettingsPanelState
        tone="error"
        title="Không đọc được bảng giá"
        detail="Thử tải lại trang. Nếu vẫn lỗi, hệ thống vẫn an toàn: đơn được chuyển về cho Sale."
      />
    );
  }

  const busy = create.isPending || apply.isPending || activate.isPending || archive.isPending;

  return (
    <section className="settings-section-stack" aria-label="Bảng giá">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Giá áp dụng cho đơn mới</p>
          <h2>Bảng giá</h2>
          <p>
            Hệ thống chỉ dùng bảng giá <b>chính thức</b> của đúng tháng hiện tại. Không có bảng giá
            đó thì mọi câu hỏi giá và đơn hàng được chuyển về cho Sale.
          </p>
        </div>
        {canConfigure && !wizardOpen && (
          <button
            type="button"
            className="settings-button settings-button--primary"
            onClick={() => {
              setWizardOpen(true);
              setNotice(undefined);
            }}
          >
            Tạo bảng giá
          </button>
        )}
      </header>

      {notice && <SettingsPanelState tone="success" title="Đã xong" detail={notice} />}

      {wizardOpen && (
        <PricePeriodWizard
          currentMonth={board.currentMonth}
          periods={view.periods}
          dataClassificationTest={dataClassificationTest}
          pending={create.isPending}
          {...(create.error ? { error: create.error.message } : {})}
          onCancel={() => setWizardOpen(false)}
          onSubmit={(plan) => create.mutate(plan)}
        />
      )}

      {/* ---- Ba khai niem, ba khoi rieng. Khong bao gio gop vao mot danh sach mo ho. ---- */}
      <div className="settings-price-board">
        <article
          className={`settings-price-card settings-price-card--${board.official ? 'official' : 'missing'}`}
        >
          <p className="settings-eyebrow">
            Bảng giá chính thức · {formatMonth(board.currentMonth)}
          </p>
          {board.official ? (
            <>
              <strong>Đang áp dụng</strong>
              <p>
                {board.official.prices.length} mặt hàng · {pricePeriodOrigin(board.official)}
              </p>
              <div className="settings-price-card__actions">
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => setSelectedId(board.official!.id)}
                >
                  Xem chi tiết
                </button>
                {canConfigure && (
                  <button
                    type="button"
                    className="settings-button settings-button--danger-quiet"
                    disabled={busy}
                    onClick={() => askArchive(board.official!)}
                  >
                    Lưu trữ
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <strong>Chưa có</strong>
              <p>
                Tháng này chưa có bảng giá chính thức, nên hệ thống chưa tự báo giá hay chốt đơn
                được.
              </p>
              {canConfigure && (
                <div className="settings-price-card__actions">
                  <button
                    type="button"
                    className="settings-button settings-button--primary"
                    onClick={() => setWizardOpen(true)}
                  >
                    Thiết lập bảng giá
                  </button>
                </div>
              )}
            </>
          )}
        </article>

        {board.testOnly && (
          <article className="settings-price-card settings-price-card--test">
            <p className="settings-eyebrow">Chỉ để chạy thử (UAT)</p>
            <strong>{formatMonth(board.testOnly.validMonth ?? '')}</strong>
            <p>
              {board.testOnly.prices.length} mặt hàng có giá để chạy thử. Đây <b>không</b> phải bảng
              giá chính thức và không làm hệ thống được coi là đủ điều kiện chạy thật.
            </p>
            <div className="settings-price-card__actions">
              <button
                type="button"
                className="settings-button settings-button--quiet"
                onClick={() => setSelectedId(board.testOnly!.id)}
              >
                Xem chi tiết
              </button>
              {canConfigure && (
                <button
                  type="button"
                  className="settings-button settings-button--danger-quiet"
                  disabled={busy}
                  onClick={() => askArchive(board.testOnly!)}
                >
                  Lưu trữ
                </button>
              )}
            </div>
          </article>
        )}

        <article className="settings-price-card settings-price-card--draft">
          <p className="settings-eyebrow">Bản nháp</p>
          {board.drafts.length === 0 ? (
            <>
              <strong>Không có bản nháp</strong>
              <p>Bản nháp là nơi sửa giá an toàn — chưa ảnh hưởng đơn nào cho tới khi kích hoạt.</p>
            </>
          ) : (
            <ul className="settings-price-draft-list">
              {board.drafts.map((draft) => (
                <li key={draft.id}>
                  <span>
                    <strong>{formatMonth(draft.validMonth ?? '')}</strong>
                    <small>
                      {draft.prices.length} mặt hàng · {pricePeriodOrigin(draft)}
                      {isTestOnlyPeriod(draft) ? ' · chỉ để chạy thử' : ''}
                    </small>
                  </span>
                  <span className="settings-price-card__actions">
                    <button
                      type="button"
                      className="settings-button settings-button--quiet"
                      onClick={() => setSelectedId(draft.id)}
                    >
                      Mở để sửa
                    </button>
                    {canConfigure && canArchivePeriod(draft) && (
                      <button
                        type="button"
                        className="settings-button settings-button--danger-quiet"
                        disabled={busy}
                        aria-label={`Lưu trữ bản nháp ${draft.validMonth ?? ''}`}
                        onClick={() => askArchive(draft)}
                      >
                        Lưu trữ bản nháp
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {/* ---- Ky dang mo ---- */}
      {selected && (
        <section className="settings-table-section" aria-labelledby="settings-price-detail-title">
          <div className="settings-subheading">
            <div>
              <p className="settings-eyebrow">
                {PRICE_PERIOD_KIND_LABELS[classifyPricePeriod(selected, board.currentMonth)]} ·{' '}
                {pricePeriodOrigin(selected)}
              </p>
              <h3 id="settings-price-detail-title">
                {formatMonth(selected.validMonth ?? '')}
                {isTestOnlyPeriod(selected) && (
                  <span className="settings-badge settings-badge--test">CHỈ ĐỂ CHẠY THỬ</span>
                )}
              </h3>
            </div>
            {view.periods.length > 1 && (
              <label className="settings-field settings-price-picker">
                <span>Xem kỳ khác</span>
                <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {view.periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {formatMonth(period.validMonth ?? '')} ·{' '}
                      {PRICE_PERIOD_KIND_LABELS[classifyPricePeriod(period, board.currentMonth)]} ·{' '}
                      {period.prices.length} mặt hàng
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Mot ky thang truoc van con `active` KHONG ap dung cho don thang nay — may chu chi doc
              ky dung thang hien hanh. Goi no la "đang áp dụng" la noi sai voi khach. */}
          {!isDraft && (
            <SettingsPanelState
              tone={isPeriodInEffect(selected, board.currentMonth) ? 'success' : 'neutral'}
              title={
                selected.status === 'archived'
                  ? 'Kỳ đã lưu trữ — chỉ xem'
                  : isPeriodInEffect(selected, board.currentMonth)
                    ? 'Kỳ đang áp dụng — chỉ xem'
                    : `Kỳ đã hết hiệu lực — chỉ xem`
              }
              detail={
                isPeriodInEffect(selected, board.currentMonth) || selected.status === 'archived'
                  ? 'Muốn đổi giá thì tạo một bản nháp mới rồi kích hoạt. Kỳ đã áp dụng không sửa trực tiếp được, để giá đã chốt của đơn cũ không bị đổi ngược.'
                  : `Kỳ này của tháng khác nên không còn quyết định giá cho đơn mới. Hệ thống chỉ dùng bảng giá của ${formatMonth(board.currentMonth)}.`
              }
            />
          )}

          {isDraft && canConfigure && (
            <ol className="settings-steps" aria-label="Các bước hoàn thiện bảng giá">
              <li>Chọn mặt hàng và nhập giá</li>
              <li>Kiểm tra bảng giá</li>
              <li>Kích hoạt</li>
            </ol>
          )}

          <PriceRowsEditor
            rows={rows}
            onChange={setRows}
            catalogue={catalogue}
            readOnly={!isDraft || !canConfigure}
            disabled={busy}
            {...(isDraft && canConfigure
              ? {
                  onRemove: askRemoveRow,
                  removingSku,
                  onAdd: (sku: string) => setRows((current) => addRow(current, sku)),
                }
              : {})}
          />

          {isDraft && canConfigure && (
            <>
              <div className="settings-drawer__actions settings-price-actions">
                <div className="settings-price-actions__group">
                  <button
                    type="button"
                    className="settings-button settings-button--quiet"
                    disabled={busy}
                    onClick={() => apply.mutate()}
                  >
                    {apply.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
                  </button>
                  <button
                    type="button"
                    className="settings-button settings-button--quiet"
                    disabled={validate.isPending || busy}
                    onClick={() => validate.mutate()}
                  >
                    {validate.isPending ? 'Đang kiểm tra…' : 'Kiểm tra bảng giá'}
                  </button>
                </div>
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={busy}
                  onClick={askActivate}
                >
                  Kích hoạt bảng giá {formatMonth(selected.validMonth ?? '')}
                </button>
              </div>

              {validate.data && (
                <SettingsPanelState
                  tone={validate.data.valid ? 'success' : 'error'}
                  title={validate.data.valid ? 'Bảng giá hợp lệ' : 'Bảng giá chưa hợp lệ'}
                  detail={
                    validate.data.valid
                      ? `${validate.data.priceCount} mặt hàng đã có giá đầy đủ.`
                      : validate.data.errors.join('; ')
                  }
                />
              )}

              {/* Nhap hang loat lui ve day: khach binh thuong khong bao gio phai cham vao (#117 §4.4). */}
              <details className="settings-bulk-import">
                <summary>Nâng cao · Nhập hàng loạt</summary>
                <label className="settings-field">
                  <span>Dán dữ liệu bảng giá đã xuất từ hệ thống khác</span>
                  <textarea
                    rows={6}
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => {
                    try {
                      const parsed: unknown = JSON.parse(importText);
                      if (!Array.isArray(parsed)) throw new Error('Dữ liệu phải là một danh sách.');
                      setRows(parsed as PricePeriodPrice[]);
                      setLocalError(undefined);
                      setNotice('Đã nạp dữ liệu vào bảng. Kiểm tra lại rồi bấm Lưu bản nháp.');
                    } catch (error) {
                      setLocalError(
                        error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.',
                      );
                    }
                  }}
                >
                  Nạp vào bảng
                </button>
              </details>
            </>
          )}
        </section>
      )}

      {board.archived.length > 0 && (
        <details className="settings-archive-list">
          <summary>Bảng giá đã lưu trữ ({board.archived.length})</summary>
          <ul>
            {board.archived.map((period) => (
              <li key={period.id}>
                <button
                  type="button"
                  className="settings-text-action"
                  onClick={() => setSelectedId(period.id)}
                >
                  {formatMonth(period.validMonth ?? '')} · {period.prices.length} mặt hàng ·{' '}
                  {pricePeriodOrigin(period)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(localError || mutationError) && (
        <SettingsPanelState
          tone="error"
          title="Chưa thực hiện được"
          detail={localError ?? mutationError?.message ?? 'Lỗi không xác định.'}
        />
      )}

      {pending && (
        <ConfirmDialog
          confirmation={pending.confirmation}
          tone={pending.tone}
          pending={busy || removeDraftRow.isPending}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
