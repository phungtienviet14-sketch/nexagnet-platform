'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { settingsApi, type JsonObject, type RuleConfigVersion } from '../../lib/settings';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

type RuleNumbers = {
  freeShipMinQuantity: number;
  shipFeeNoiThanh: number;
  shipFeeTinh: number;
  vatRate: number;
  codFee: number;
  totalMismatchTolerance: number;
  largeOrderTotal: number;
  largeOrderQuantity: number;
  lowConfidence: number;
};

const DEFAULT_RULES: RuleNumbers = {
  freeShipMinQuantity: 2,
  shipFeeNoiThanh: 30_000,
  shipFeeTinh: 40_000,
  vatRate: 0.1,
  codFee: 20_000,
  totalMismatchTolerance: 0.05,
  largeOrderTotal: 20_000_000,
  largeOrderQuantity: 30,
  lowConfidence: 0.5,
};

const RULE_FIELDS: readonly {
  key: keyof RuleNumbers;
  label: string;
  unit: string;
  step: number;
  min: number;
  max?: number;
  provisional?: string;
}[] = [
  {
    key: 'freeShipMinQuantity',
    label: 'Miễn ship từ số lượng',
    unit: 'sản phẩm',
    step: 1,
    min: 1,
    provisional: 'A3',
  },
  {
    key: 'shipFeeNoiThanh',
    label: 'Ship nội thành',
    unit: 'đ',
    step: 1_000,
    min: 0,
    provisional: 'A3',
  },
  { key: 'shipFeeTinh', label: 'Ship đi tỉnh', unit: 'đ', step: 1_000, min: 0, provisional: 'A3' },
  {
    key: 'vatRate',
    label: 'Thuế suất VAT',
    unit: 'tỷ lệ',
    step: 0.01,
    min: 0,
    max: 1,
    provisional: 'D8',
  },
  { key: 'codFee', label: 'Phí thu hộ COD', unit: 'đ', step: 1_000, min: 0, provisional: 'D15' },
  {
    key: 'totalMismatchTolerance',
    label: 'Ngưỡng lệch tổng',
    unit: 'tỷ lệ',
    step: 0.01,
    min: 0,
    max: 1,
  },
  { key: 'largeOrderTotal', label: 'Ngưỡng đơn lớn', unit: 'đ', step: 1_000_000, min: 0 },
  { key: 'largeOrderQuantity', label: 'Ngưỡng số lượng lớn', unit: 'sản phẩm', step: 1, min: 1 },
  {
    key: 'lowConfidence',
    label: 'Độ tin cậy tối thiểu',
    unit: 'tỷ lệ',
    step: 0.05,
    min: 0,
    max: 1,
  },
];

const STATUS_LABELS: Readonly<Record<RuleConfigVersion['status'], string>> = {
  draft: 'Bản nháp',
  preview: 'Đã xem trước',
  active: 'Đang áp dụng',
  archived: 'Đã lưu trữ',
};

function buildPayload(values: RuleNumbers): JsonObject {
  return {
    schemaVersion: 1,
    rules: {
      freeShipMinQuantity: values.freeShipMinQuantity,
      shipFeeNoiThanh: values.shipFeeNoiThanh,
      shipFeeTinh: values.shipFeeTinh,
      vatRate: values.vatRate,
      codFee: values.codFee,
      totalMismatchTolerance: values.totalMismatchTolerance,
      noiThanhKeywords: ['ha noi', 'hn', 'ho chi minh', 'hcm', 'sai gon', 'tphcm'],
    },
    agents: {
      largeOrderTotal: values.largeOrderTotal,
      largeOrderQuantity: values.largeOrderQuantity,
      lowConfidence: values.lowConfidence,
    },
  };
}

function validateValues(values: RuleNumbers): string | undefined {
  const invalidField = RULE_FIELDS.find((field) => {
    const value = values[field.key];
    return (
      !Number.isFinite(value) || value < field.min || (field.max !== undefined && value > field.max)
    );
  });
  return invalidField ? `${invalidField.label} nằm ngoài khoảng cho phép.` : undefined;
}

export function RulesSettings() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<RuleNumbers>(DEFAULT_RULES);
  const [selectedId, setSelectedId] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [previewedId, setPreviewedId] = useState<string>();
  const query = useQuery({ queryKey: ['settings-rules'], queryFn: settingsApi.rules });
  const selectedRule =
    query.data?.find((rule) => rule.id === selectedId) ??
    query.data?.find((rule) => rule.status === 'preview') ??
    query.data?.find((rule) => rule.status === 'active') ??
    query.data?.[0];

  const createMutation = useMutation({
    mutationFn: (payload: JsonObject) => settingsApi.createRuleDraft(payload),
    onSuccess: (rule) => {
      setSelectedId(rule.id);
      setPreviewedId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['settings-rules'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
    },
  });
  const previewMutation = useMutation({
    mutationFn: (id: string) =>
      settingsApi.previewRule(id, {
        orderType: 'TH2',
        totalQuantity: 1,
        region: 'HN',
        itemsSubtotal: 11_500_000,
        codCollect: true,
        wantVat: true,
      }),
    onSuccess: (_, id) => {
      setPreviewedId(id);
      void queryClient.invalidateQueries({ queryKey: ['settings-rules'] });
    },
  });
  const activateMutation = useMutation({
    mutationFn: settingsApi.activateRule,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings-rules'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
    },
  });

  const handleCreate = () => {
    const error = validateValues(values);
    setFormError(error);
    if (!error) createMutation.mutate(buildPayload(values));
  };

  const handleActivate = (rule: RuleConfigVersion) => {
    if (rule.provisionalKeys.length > 0) return;
    const confirmed = window.confirm(
      `Kích hoạt rules ${rule.version}? Chỉ đơn mới và lần “Chạy lại” có chủ ý dùng cấu hình này.`,
    );
    if (confirmed) activateMutation.mutate(rule.id);
  };

  const actionError = createMutation.error ?? previewMutation.error ?? activateMutation.error;
  const isPreviewed = selectedRule?.status === 'preview' || previewedId === selectedRule?.id;
  const hasProvisional =
    !selectedRule?.provisionalVerified || Boolean(selectedRule.provisionalKeys.length);

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Schema cố định · không chạy code</p>
          <h2>Rules & công thức</h2>
          <p>Tạo bản nháp, kiểm tra trên đơn mẫu rồi mới kích hoạt cho đơn mới.</p>
        </div>
        {selectedRule && (
          <span className={`settings-version-chip settings-version-chip--${selectedRule.status}`}>
            {selectedRule.version} · {STATUS_LABELS[selectedRule.status]}
          </span>
        )}
      </header>

      <div className="settings-provisional" role="note">
        <strong>A3 · D8 · D15 đang tạm tính</strong>
        <p>
          Cước ship, VAT và phí COD chưa có xác nhận cuối từ khách hàng. Không thể xác nhận
          production khi bản rules còn cờ này.
        </p>
      </div>

      <div className="settings-rules-layout">
        <section className="settings-rule-form" aria-labelledby="settings-new-rules-title">
          <div className="settings-subheading">
            <div>
              <p className="settings-eyebrow">Bản nháp mới</p>
              <h3 id="settings-new-rules-title">Các ngưỡng nghiệp vụ</h3>
            </div>
          </div>
          <div className="settings-rule-fields">
            {RULE_FIELDS.map((field) => (
              <label key={field.key} className="settings-rule-field">
                <span>
                  {field.label}
                  {field.provisional && <sup>{field.provisional}</sup>}
                </span>
                <span className="settings-number-input">
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={values[field.key]}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: Number(event.target.value),
                      }))
                    }
                  />
                  <small>{field.unit}</small>
                </span>
              </label>
            ))}
          </div>
          {formError && (
            <p className="settings-form-error" role="alert">
              {formError}
            </p>
          )}
          <button
            type="button"
            className="settings-button settings-button--primary"
            disabled={createMutation.isPending}
            onClick={handleCreate}
          >
            {createMutation.isPending ? 'Đang lưu bản nháp…' : 'Lưu thành bản nháp'}
          </button>
        </section>

        <section className="settings-version-list" aria-labelledby="settings-rule-versions-title">
          <div className="settings-subheading">
            <div>
              <p className="settings-eyebrow">Vòng đời cấu hình</p>
              <h3 id="settings-rule-versions-title">Các phiên bản</h3>
            </div>
          </div>
          {query.isLoading && (
            <SettingsPanelState title="Đang tải rules" detail="Đọc các phiên bản đã lưu…" />
          )}
          {query.error && (
            <SettingsPanelState
              tone="error"
              title="Không tải được rules"
              detail={query.error.message}
              action={
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => query.refetch()}
                >
                  Thử lại
                </button>
              }
            />
          )}
          {query.isSuccess && query.data.length === 0 && (
            <SettingsPanelState
              title="Chưa có phiên bản rules"
              detail="Nhập các ngưỡng và lưu bản nháp đầu tiên."
            />
          )}
          {query.data?.map((rule) => (
            <button
              key={rule.id}
              type="button"
              className="settings-version-row"
              aria-current={selectedRule?.id === rule.id ? 'true' : undefined}
              onClick={() => setSelectedId(rule.id)}
            >
              <span>
                <strong>{rule.version}</strong>
                <small>{formatSettingsDate(rule.createdAt)}</small>
              </span>
              <span className={`settings-version-chip settings-version-chip--${rule.status}`}>
                {STATUS_LABELS[rule.status]}
              </span>
            </button>
          ))}

          {selectedRule && (
            <div className="settings-rule-actions">
              <button
                type="button"
                className="settings-button settings-button--quiet"
                disabled={previewMutation.isPending || selectedRule.status === 'active'}
                onClick={() => previewMutation.mutate(selectedRule.id)}
              >
                {previewMutation.isPending ? 'Đang chạy đơn mẫu…' : 'Xem trước trên đơn mẫu'}
              </button>
              <button
                type="button"
                className="settings-button settings-button--primary"
                disabled={
                  !isPreviewed ||
                  hasProvisional ||
                  activateMutation.isPending ||
                  selectedRule.status === 'active'
                }
                title={
                  hasProvisional
                    ? 'Cần xác minh A3/D8/D15 trước khi kích hoạt production'
                    : undefined
                }
                onClick={() => handleActivate(selectedRule)}
              >
                {activateMutation.isPending ? 'Đang kích hoạt…' : 'Kích hoạt phiên bản'}
              </button>
            </div>
          )}
        </section>
      </div>

      {previewMutation.data && (
        <section className="settings-preview-result" aria-live="polite">
          <div>
            <p className="settings-eyebrow">Kết quả đơn mẫu TH2</p>
            <h3>Rules chạy thuần, chưa ghi đơn</h3>
          </div>
          <div>
            {Object.entries(previewMutation.data.totals ?? {}).map(([key, value]) => (
              <span key={key}>
                <small>{key}</small>
                <strong>
                  {typeof value === 'number' ? value.toLocaleString('vi-VN') : String(value)}
                </strong>
              </span>
            ))}
            {previewMutation.data.warnings.map((warning) => (
              <p key={warning} className="settings-warning-text">
                {warning}
              </p>
            ))}
          </div>
        </section>
      )}

      {actionError && (
        <SettingsPanelState
          tone="error"
          title="Thao tác rules chưa hoàn tất"
          detail={actionError.message}
        />
      )}
    </div>
  );
}
