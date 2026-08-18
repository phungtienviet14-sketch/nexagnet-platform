'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { skusMissingWholesale } from '../../lib/price-rows';
import { settingsApi, type PricePeriodPrice, type PricePeriod } from '../../lib/settings';
import { PriceRowsEditor } from './PriceRowsEditor';
import { SettingsPanelState } from './SettingsPanelState';

/** Khop `TEST_ONLY_PRICE_PERIOD_SOURCE` phia API — ky UAT khong bao gio lam xanh readiness. */
const TEST_ONLY_SOURCE = 'test_only';

function parseRows(text: string): PricePeriodPrice[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error('Import phải là một mảng JSON.');
  return value.map((row, index) => {
    if (typeof row !== 'object' || row === null) throw new Error(`Dòng ${index + 1} không hợp lệ.`);
    const item = row as Record<string, unknown>;
    if (typeof item.sku !== 'string' || typeof item.wholesale !== 'number') {
      throw new Error(`Dòng ${index + 1} cần sku và wholesale dạng số.`);
    }
    return item as unknown as PricePeriodPrice;
  });
}

export function PricePeriodsSettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['settings-price-periods'], queryFn: settingsApi.pricePeriods });
  const periods = query.data?.periods ?? [];
  const currentMonth = query.data?.currentMonth ?? new Date().toISOString().slice(0, 7);
  const activeCurrentPeriod = periods.find(
    (period) => period.validMonth === currentMonth && period.status === 'active'
  );

  const [validMonth, setValidMonth] = useState(currentMonth);
  const [selectedId, setSelectedId] = useState('');
  const [importText, setImportText] = useState('[]');
  const [overwrite, setOverwrite] = useState(true);
  const [localError, setLocalError] = useState<string>();
  const [actionSuccess, setActionSuccess] = useState<string>();
  // Ky UAT: co gia de chay thu nhung KHONG duoc lam xanh cong readiness. Backend da co san co che
  // (`source=test_only`, chi activate khi DATA_CLASSIFICATION=test) — truoc day UI khong co duong
  // nao bat no, nen cach duy nhat de test auto-confirm la doi nhan thang cua bang gia THAT.
  const [testOnly, setTestOnly] = useState(false);

  // Auto-select draft period if available, otherwise active current period, otherwise first period
  const selected: PricePeriod | undefined = useMemo(() => {
    if (selectedId) return periods.find((p) => p.id === selectedId);
    const draft = periods.find((p) => p.status === 'draft');
    if (draft) return draft;
    if (activeCurrentPeriod) return activeCurrentPeriod;
    return periods[0];
  }, [selectedId, periods, activeCurrentPeriod]);

  const isDraft = selected?.status === 'draft';
  const draftId = isDraft ? (selected?.id ?? '') : '';

  const [rows, setRows] = useState<PricePeriodPrice[]>([]);
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

  const missingWholesale = useMemo(() => skusMissingWholesale(rows), [rows]);

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['settings-price-periods'] });
    await client.invalidateQueries({ queryKey: ['settings-summary'] });
    await client.invalidateQueries({ queryKey: ['settings-source-truth'] });
  };

  const create = useMutation({
    mutationFn: () =>
      settingsApi.createPricePeriod(
        validMonth,
        testOnly ? `UAT_TEST_ONLY_${validMonth}` : undefined,
        testOnly,
      ),
    onSuccess: (newPeriod) => {
      setSelectedId(newPeriod.id);
      setActionSuccess(
        testOnly
          ? `Đã tạo kỳ NHÁP TEST ${newPeriod.validMonth} — kỳ này không làm xanh cổng sẵn sàng vận hành`
          : `Đã tạo kỳ nháp ${newPeriod.validMonth}`,
      );
      void refresh();
    },
  });

  const archive = useMutation({
    mutationFn: (periodId: string) => settingsApi.archivePricePeriod(periodId),
    onSuccess: (archived) => {
      setSelectedId('');
      setActionSuccess(`Đã lưu trữ kỳ giá ${archived.validMonth} — kỳ này thôi áp dụng từ bây giờ`);
      void refresh();
    },
  });

  const copy = useMutation({
    mutationFn: (sourceIdToCopy?: string | void) => {
      const sourceId = (typeof sourceIdToCopy === 'string' ? sourceIdToCopy : undefined) ?? selectedId ?? selected?.id ?? periods[0]?.id;
      if (!sourceId) throw new Error('Cần ít nhất một kỳ nguồn để sao chép bảng giá.');
      return settingsApi.copyPricePeriod(sourceId, validMonth || currentMonth);
    },
    onSuccess: (newPeriod) => {
      setSelectedId(newPeriod.id);
      setActionSuccess(`Đã tạo kỳ nháp ${newPeriod.validMonth} từ bảng giá trước (${newPeriod.prices.length} SKU)`);
      void refresh();
    },
  });

  const preview = useMutation({ mutationFn: () => settingsApi.previewPriceImport(draftId, rows, overwrite) });
  const apply = useMutation({
    mutationFn: () => settingsApi.applyPriceImport(draftId, rows, overwrite),
    onSuccess: () => {
      setActionSuccess('Đã lưu thay đổi bảng giá vào bản nháp thành công.');
      void refresh();
    },
  });

  const validate = useMutation({ mutationFn: () => settingsApi.validatePricePeriod(draftId) });
  const activate = useMutation({
    mutationFn: () => settingsApi.activatePricePeriod(draftId),
    onSuccess: (activatedPeriod) => {
      setActionSuccess(`Đã kích hoạt thành công kỳ giá ${activatedPeriod.validMonth} cho toàn hệ thống!`);
      void refresh();
    },
  });

  const mutationError =
    create.error ??
    copy.error ??
    preview.error ??
    apply.error ??
    validate.error ??
    activate.error ??
    archive.error;

  const isTestOnly = (period: PricePeriod) => period.source === TEST_ONLY_SOURCE;
  const periodLabel = (period: PricePeriod) =>
    `Tháng ${period.validMonth ?? '---'} · ${period.status.toUpperCase()}` +
    `${isTestOnly(period) ? ' · CHỈ ĐỂ TEST' : ''} (${period.prices.length} SKU)`;

  const prepareRows = () => {
    if (rows.length === 0) {
      setLocalError('Bảng giá đang trống — hãy sao chép từ kỳ trước hoặc nhập dữ liệu.');
      return false;
    }
    if (missingWholesale.length > 0) {
      setLocalError(`Còn thiếu đơn giá CTV (bắt buộc) cho: ${missingWholesale.join(', ')}`);
      return false;
    }
    setLocalError(undefined);
    return true;
  };

  const handleSaveAndActivate = async () => {
    if (!prepareRows()) return;
    try {
      setLocalError(undefined);
      await apply.mutateAsync();
      const val = await validate.mutateAsync();
      if (!val.valid) {
        setLocalError(`Kỳ giá chưa hợp lệ: ${val.errors.join('; ')}`);
        return;
      }
      if (window.confirm(`Kích hoạt bảng giá tháng ${selected?.validMonth} (${rows.length} SKU) cho toàn bộ đơn hàng và báo giá mới?`)) {
        await activate.mutateAsync();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Không thể lưu hoặc kích hoạt kỳ giá.');
    }
  };

  const handleQuickInitCurrentMonth = () => {
    const source = periods.find((p) => p.prices.length > 0) ?? periods[0];
    if (!source) {
      create.mutate();
      return;
    }
    setValidMonth(currentMonth);
    copy.mutate(source.id);
  };

  const loadJsonIntoTable = () => {
    try {
      setRows(parseRows(importText));
      setLocalError(undefined);
      setActionSuccess('Đã nạp dữ liệu JSON vào bảng thành công.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Dữ liệu import không hợp lệ.');
    }
  };

  return (
    <section className="settings-section-stack" aria-label="Quản lý kỳ bảng giá">
      <div className="settings-subheading" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Quản lý Bảng giá & Kỳ giá sản phẩm</h3>
          <p>Cấu hình bảng giá theo tháng cho toàn bộ sản phẩm Ultty. Hệ thống áp dụng bảng giá có trạng thái Active đúng tháng hiện hành.</p>
        </div>
        {activeCurrentPeriod ? (
          <span className="settings-badge" style={{ backgroundColor: '#10B981', color: '#fff', padding: '0.35rem 0.75rem', borderRadius: '4px', fontWeight: 600 }}>
            ● Kỳ {currentMonth}: Đang Hoạt động ({activeCurrentPeriod.prices.length} SKU)
          </span>
        ) : (
          <span className="settings-badge" style={{ backgroundColor: '#EF4444', color: '#fff', padding: '0.35rem 0.75rem', borderRadius: '4px', fontWeight: 600 }}>
            ▲ Thiếu bảng giá Active tháng {currentMonth}
          </span>
        )}
      </div>

      {query.data?.missingCurrentPeriod && (
        <div style={{ background: 'var(--surface-subtle, #FFFBEB)', border: '1px solid #F59E0B', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <strong style={{ color: '#B45309', fontSize: '1rem' }}>⚠️ Chưa có bảng giá Active cho tháng {currentMonth}</strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#78350F' }}>
              Khi chưa có bảng giá tháng {currentMonth}, Agent sẽ tự động chuyển các câu hỏi giá và đơn hàng về cho Sale xử lý an toàn.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="settings-button settings-button--primary"
              disabled={copy.isPending || create.isPending}
              onClick={handleQuickInitCurrentMonth}
            >
              ⚡ Khởi tạo nhanh bảng giá tháng {currentMonth} từ kỳ trước
            </button>
          </div>
        </div>
      )}

      {actionSuccess && (
        <SettingsPanelState tone="success" title="Thao tác thành công" detail={actionSuccess} />
      )}

      <div className="settings-form-grid" style={{ marginTop: '0.5rem' }}>
        <label className="settings-field">
          <span>Kỳ bảng giá đang xem / chỉnh sửa</span>
          <select value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}>
            {periods.length === 0 && <option value="">Chưa có kỳ nào</option>}
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {periodLabel(period)}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <label className="settings-field" style={{ flex: 1, margin: 0 }}>
            <span>Tháng mới</span>
            <input type="month" value={validMonth} onChange={(event) => setValidMonth(event.target.value)} />
          </label>
          <button
            className="settings-button settings-button--quiet"
            type="button"
            style={{ whiteSpace: 'nowrap' }}
            disabled={!validMonth || copy.isPending}
            onClick={() => copy.mutate()}
          >
            Sao chép kỳ này sang nháp mới
          </button>
          <button
            className="settings-button settings-button--quiet"
            type="button"
            style={{ whiteSpace: 'nowrap' }}
            disabled={!validMonth || create.isPending}
            onClick={() => create.mutate()}
          >
            Tạo kỳ trống
          </button>
        </div>
      </div>

      {/* Doi nhan thang cua bang gia THAT de "cho co gia" la lam gia bang gia va lam xanh gia cong
          readiness. Duong dung la ky TEST: co gia de chay thu, nhung readiness van bao thieu. */}
      <label className="settings-checkbox-field" style={{ margin: '0 0 0.25rem' }}>
        <input
          type="checkbox"
          checked={testOnly}
          onChange={(event) => setTestOnly(event.target.checked)}
        />
        <span>
          Kỳ này <b>chỉ để test (UAT)</b> — có giá để chạy thử nhưng <b>không</b> được tính là bảng
          giá chính thức. Cần <code>DATA_CLASSIFICATION=test</code> mới kích hoạt được, và nhớ lưu
          trữ khi test xong.
        </span>
      </label>

      {selected && !isDraft && (
        <div style={{ background: '#F3F4F6', borderRadius: '6px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
              Kỳ <b>{selected.validMonth}</b> đang ở trạng thái <b>{selected.status.toUpperCase()}</b> ({selected.prices.length} SKU). Để chỉnh sửa giá, hãy tạo bản nháp mới hoặc sao chép kỳ này.
            </p>
            {isTestOnly(selected) && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: '#B45309' }}>
                Kỳ <b>CHỈ ĐỂ TEST</b> — cấp giá cho UAT nhưng không bao giờ làm xanh cổng “Sẵn sàng
                vận hành”. Lưu trữ kỳ này khi kết thúc đợt test.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="settings-button settings-button--quiet"
              onClick={() => {
                setValidMonth(selected.validMonth || currentMonth);
                copy.mutate(selected.id);
              }}
            >
              Tạo bản nháp từ kỳ này để sửa
            </button>
            {selected.status === 'active' && (
              <button
                type="button"
                className="settings-button settings-button--quiet"
                disabled={archive.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Lưu trữ bảng giá tháng ${selected.validMonth}? Kỳ này thôi áp dụng ngay, và nếu không còn kỳ nào khác cho tháng hiện tại thì mọi đơn sẽ chuyển hết về Sale.`,
                    )
                  ) {
                    archive.mutate(selected.id);
                  }
                }}
              >
                Lưu trữ kỳ này
              </button>
            )}
          </div>
        </div>
      )}

      {selected && (
        <>
          <PriceRowsEditor rows={rows} onChange={setRows} disabled={!isDraft || apply.isPending} />

          {isDraft && (
            <>
              {missingWholesale.length > 0 && (
                <SettingsPanelState
                  tone="error"
                  title="Còn SKU chưa có đơn giá CTV"
                  detail={`Không kích hoạt được kỳ khi còn thiếu giá CTV cho: ${missingWholesale.join(', ')}`}
                />
              )}

              <div className="settings-drawer__actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle, #E5E7EB)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="settings-button settings-button--quiet"
                    type="button"
                    disabled={apply.isPending}
                    onClick={() => prepareRows() && apply.mutate()}
                  >
                    {apply.isPending ? 'Đang lưu…' : '💾 Lưu bản nháp'}
                  </button>
                  <button
                    className="settings-button settings-button--quiet"
                    type="button"
                    disabled={validate.isPending}
                    onClick={() => validate.mutate()}
                  >
                    Kiểm tra hợp lệ (Validate)
                  </button>
                </div>
                <div>
                  <button
                    className="settings-button settings-button--primary"
                    type="button"
                    style={{ fontWeight: 600, padding: '0.6rem 1.5rem' }}
                    disabled={activate.isPending || apply.isPending}
                    onClick={handleSaveAndActivate}
                  >
                    🚀 Lưu & Kích hoạt Bảng giá tháng {selected.validMonth}
                  </button>
                </div>
              </div>

              <details className="settings-bulk-import" style={{ marginTop: '0.75rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-muted, #6B7280)' }}>
                  Tùy chọn nâng cao: Nhập dữ liệu hàng loạt bằng JSON
                </summary>
                <div style={{ marginTop: '0.5rem' }}>
                  <label className="settings-field">
                    <span>Dán mảng JSON bảng giá:</span>
                    <textarea rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} />
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <button className="settings-button settings-button--quiet" type="button" onClick={loadJsonIntoTable}>
                      Nạp vào bảng
                    </button>
                    <label className="settings-checkbox-field" style={{ margin: 0 }}>
                      <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
                      <span>Ghi đè dòng đã có</span>
                    </label>
                  </div>
                </div>
              </details>
            </>
          )}
        </>
      )}

      {validate.data && (
        <SettingsPanelState
          tone={validate.data.valid ? 'success' : 'error'}
          title={validate.data.valid ? 'Bảng giá hợp lệ 100%' : 'Bảng giá chưa hợp lệ'}
          detail={validate.data.valid ? `${validate.data.priceCount}/${validate.data.productCount} SKU đã có giá đầy đủ.` : validate.data.errors.join('; ')}
        />
      )}

      {(localError || mutationError) && (
        <SettingsPanelState tone="error" title="Thông báo lỗi" detail={localError ?? mutationError?.message ?? 'Lỗi không xác định'} />
      )}
    </section>
  );
}

