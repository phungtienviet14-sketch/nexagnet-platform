'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { settingsApi, type PricePeriodPrice } from '../../lib/settings';
import { SettingsPanelState } from './SettingsPanelState';

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
  const [validMonth, setValidMonth] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [importText, setImportText] = useState('[]');
  const [overwrite, setOverwrite] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const selected = periods.find((period) => period.id === selectedId) ?? periods.find((period) => period.status === 'draft');
  const draftId = selected?.status === 'draft' ? selected.id : '';
  useEffect(() => {
    if (!selected) return;
    setImportText(JSON.stringify(selected.prices.map(({ id: _id, ...row }) => row), null, 2));
    setLocalError(undefined);
  }, [selected]);
  const rows = useMemo(() => {
    try {
      return parseRows(importText);
    } catch {
      return [];
    }
  }, [importText]);

  const refresh = () => client.invalidateQueries({ queryKey: ['settings-price-periods'] });
  const create = useMutation({ mutationFn: () => settingsApi.createPricePeriod(validMonth), onSuccess: refresh });
  const copy = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('Chọn kỳ nguồn trước khi copy.');
      return settingsApi.copyPricePeriod(selectedId, validMonth);
    },
    onSuccess: refresh,
  });
  const preview = useMutation({ mutationFn: () => settingsApi.previewPriceImport(draftId, rows, overwrite) });
  const apply = useMutation({ mutationFn: () => settingsApi.applyPriceImport(draftId, rows, overwrite), onSuccess: refresh });
  const validate = useMutation({ mutationFn: () => settingsApi.validatePricePeriod(draftId) });
  const activate = useMutation({ mutationFn: () => settingsApi.activatePricePeriod(draftId), onSuccess: refresh });
  const mutationError = create.error ?? copy.error ?? preview.error ?? apply.error ?? validate.error ?? activate.error;

  const prepareRows = () => {
    try {
      const parsed = parseRows(importText);
      setLocalError(undefined);
      return parsed.length > 0;
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Dữ liệu import không hợp lệ.');
      return false;
    }
  };

  return (
    <section className="settings-section-stack" aria-label="Quản lý kỳ bảng giá">
      <div className="settings-subheading">
        <div>
          <h3>Kỳ bảng giá</h3>
          <p>Tạo nháp, xem trước và kích hoạt. Hệ thống không tự dùng giá của tháng trước.</p>
        </div>
      </div>
      {query.data?.missingCurrentPeriod && (
        <SettingsPanelState
          tone="error"
          title={`Chưa có bảng giá active cho ${query.data.currentMonth}`}
          detail="Báo giá và đơn hàng sẽ fail closed; hãy tạo/copy, kiểm tra rồi kích hoạt kỳ hiện hành."
        />
      )}
      <div className="settings-form-grid">
        <label className="settings-field">
          <span>Tháng đích</span>
          <input type="month" value={validMonth} onChange={(event) => setValidMonth(event.target.value)} />
        </label>
        <label className="settings-field">
          <span>Kỳ đang chọn</span>
          <select value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">Chọn kỳ</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.validMonth ?? 'Không có tháng'} · {period.status} · {period.prices.length} SKU
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="settings-drawer__actions">
        <button className="settings-button settings-button--quiet" type="button" disabled={!validMonth || create.isPending} onClick={() => create.mutate()}>
          Tạo kỳ nháp
        </button>
        <button className="settings-button settings-button--quiet" type="button" disabled={!validMonth || !selectedId || copy.isPending} onClick={() => copy.mutate()}>
          Copy kỳ đã chọn thành nháp
        </button>
      </div>

      {draftId && (
        <>
          <label className="settings-field">
            <span>Dữ liệu giá JSON để import/chỉnh sửa</span>
            <textarea rows={8} value={importText} onChange={(event) => setImportText(event.target.value)} />
          </label>
          <label className="settings-checkbox-field">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            <span>Cho phép ghi đè dòng operator đã sửa (có chủ ý)</span>
          </label>
          <div className="settings-drawer__actions">
            <button className="settings-button settings-button--quiet" type="button" onClick={() => prepareRows() && preview.mutate()}>
              Preview diff
            </button>
            <button className="settings-button settings-button--quiet" type="button" onClick={() => validate.mutate()}>
              Validate kỳ
            </button>
            <button className="settings-button settings-button--primary" type="button" disabled={!preview.data?.valid} onClick={() => prepareRows() && apply.mutate()}>
              Apply import đã preview
            </button>
            <button className="settings-button settings-button--primary" type="button" disabled={!validate.data?.valid} onClick={() => window.confirm('Kích hoạt kỳ giá này cho đơn mới?') && activate.mutate()}>
              Activate
            </button>
          </div>
        </>
      )}
      {preview.data && (
        <SettingsPanelState
          tone={preview.data.valid ? 'success' : 'error'}
          title={preview.data.valid ? 'Preview hợp lệ' : 'Preview có lỗi'}
          detail={`Tạo ${preview.data.created} · cập nhật ${preview.data.updated} · không đổi ${preview.data.unchanged}${preview.data.errors.length ? ` · ${preview.data.errors.join('; ')}` : ''}`}
        />
      )}
      {validate.data && (
        <SettingsPanelState
          tone={validate.data.valid ? 'success' : 'error'}
          title={validate.data.valid ? 'Kỳ giá đủ điều kiện kích hoạt' : 'Kỳ giá chưa hợp lệ'}
          detail={validate.data.valid ? `${validate.data.priceCount}/${validate.data.productCount} SKU có giá.` : validate.data.errors.join('; ')}
        />
      )}
      {(localError || mutationError) && (
        <SettingsPanelState tone="error" title="Chưa hoàn tất thao tác kỳ giá" detail={localError ?? mutationError?.message ?? 'Lỗi không xác định'} />
      )}
    </section>
  );
}
