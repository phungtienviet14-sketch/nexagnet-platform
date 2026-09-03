'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { resolvePolicyFocus } from '../../lib/settings-focus';
import { settingsApi, type JsonObject, type RuleConfigVersion } from '../../lib/settings';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsFocusModal,
  SettingsStatusBar,
  SettingsWorkCard,
  useFocusOnKey,
  useRestoreFocus,
} from './SettingsFocus';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

type RuleNumbers = {
  totalMismatchTolerance: number;
  largeOrderTotal: number;
  largeOrderQuantity: number;
  lowConfidence: number;
};

const DEFAULT_RULES: RuleNumbers = {
  totalMismatchTolerance: 0.05,
  largeOrderTotal: 20_000_000,
  largeOrderQuantity: 30,
  lowConfidence: 0.5,
};

/**
 * Bon nghiep vu VAT · COD/ship · cong no 7 ngay · khuyen mai CHUA duoc chot, nen o nhap cua chung
 * da bi go khoi form. Truoc day form van cho nhap va "Kich hoat" ship 30k/40k, VAT 0,1, COD 20k —
 * trong khi rules engine bo qua toan bo va van tinh 0 roi chuyen Sale. Nguoi van hanh vi vay tin la
 * da cau hinh xong phi COD. Nay chung chi hien o khu "chua mo", gap lai.
 */
const BLOCKED_RULES: readonly { label: string; blocker: string }[] = [
  { label: 'Miễn ship từ số lượng', blocker: 'A3' },
  { label: 'Ship nội thành', blocker: 'A3' },
  { label: 'Ship đi tỉnh', blocker: 'A3' },
  { label: 'Thuế suất VAT', blocker: 'D8' },
  { label: 'Phí thu hộ COD', blocker: 'A3' },
];

const RULE_FIELDS: readonly {
  key: keyof RuleNumbers;
  label: string;
  unit: string;
  step: number;
  min: number;
  max?: number;
}[] = [
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
  preview: 'Đã chạy thử',
  active: 'Đang áp dụng',
  archived: 'Đã lưu trữ',
};

function buildPayload(values: RuleNumbers): JsonObject {
  return {
    schemaVersion: 1,
    rules: {
      // null = chua cau hinh. Khong gui so doan len nguon su that.
      freeShipMinQuantity: null,
      shipFeeNoiThanh: null,
      shipFeeTinh: null,
      vatRate: null,
      codFee: null,
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

function firstInvalidField(values: RuleNumbers): (typeof RULE_FIELDS)[number] | undefined {
  return RULE_FIELDS.find((field) => {
    const value = values[field.key];
    return (
      !Number.isFinite(value) || value < field.min || (field.max !== undefined && value > field.max)
    );
  });
}

/**
 * Chinh sach ban hang la MOT LUONG CO DAN DUONG (#146 §3):
 *
 *   ban dang ap dung (gon)  ->  soan ban nhap  ->  chay thu  ->  xem lai va kich hoat
 *
 * Ban cu de bieu mau nhap va danh sach phien ban canh nhau, cung co, cung noi bat — nguoi van hanh
 * phai tu biet rang phai bam "Lưu bản nháp" truoc, roi "Xem trước", roi moi "Kích hoạt".
 *
 * Ngu nghia rules engine va cong provisional KHONG doi: `A3/D8/D15` chua chot thi `Kích hoạt` van
 * khoa — chi khac la ly do bay gio nam ngay canh nut.
 */
export function RulesSettings() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<RuleNumbers>(DEFAULT_RULES);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [invalidKey, setInvalidKey] = useState<keyof RuleNumbers>();
  const [previewedId, setPreviewedId] = useState<string>();
  const [confirming, setConfirming] = useState<RuleConfigVersion | null>(null);

  const query = useQuery({ queryKey: ['settings-rules'], queryFn: settingsApi.rules });
  const activeRule = query.data?.find((rule) => rule.status === 'active');
  const selectedRule =
    query.data?.find((rule) => rule.id === selectedId) ??
    query.data?.find((rule) => rule.status === 'preview') ??
    query.data?.find((rule) => rule.status === 'draft') ??
    activeRule ??
    query.data?.[0];

  const createMutation = useMutation({
    mutationFn: (payload: JsonObject) => settingsApi.createRuleDraft(payload),
    onSuccess: (rule) => {
      setSelectedId(rule.id);
      setPreviewedId(undefined);
      setEditing(false);
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
      setConfirming(null);
      setPreviewedId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['settings-rules'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
    },
  });

  const previewed = selectedRule?.status === 'preview' || previewedId === selectedRule?.id;
  const focus = resolvePolicyFocus({ editing, previewed, selected: selectedRule });

  const workHeading = useRef<HTMLHeadingElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  useFocusOnKey(workHeading, `policy:${focus.step}:${selectedRule?.id ?? 'none'}`);
  const { rememberTrigger } = useRestoreFocus(Boolean(confirming));

  const handleCreate = () => {
    const invalid = firstInvalidField(values);
    setInvalidKey(invalid?.key);
    setFormError(invalid ? `${invalid.label} nằm ngoài khoảng cho phép.` : undefined);
    if (invalid) {
      // Tieu diem ve DUNG o sai — nguoi dung khong phai di tim.
      document.getElementById(`settings-rule-${invalid.key}`)?.focus();
      return;
    }
    createMutation.mutate(buildPayload(values));
  };

  const actionError = createMutation.error ?? previewMutation.error ?? activateMutation.error;
  const history = (query.data ?? []).filter((rule) => rule.id !== selectedRule?.id);

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Ngưỡng đơn, công nợ, phí và thuế</p>
          <h2>Chính sách bán hàng</h2>
          <p>Soạn bản nháp, chạy thử trên đơn mẫu, rồi mới áp dụng cho các đơn mới.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone={activeRule ? 'ok' : 'attention'}
        title={
          activeRule
            ? `Bản ${activeRule.version} đang áp dụng cho mọi đơn mới`
            : 'Chưa có bản chính sách nào được áp dụng'
        }
        detail="Đơn đã chốt giữ nguyên chính sách tại thời điểm chốt; đổi ở đây chỉ ảnh hưởng đơn mới."
        facts={[
          ...(activeRule
            ? [{ label: 'Áp dụng từ', value: formatSettingsDate(activeRule.createdAt) }]
            : []),
          { label: 'Số bản đã lưu', value: `${query.data?.length ?? 0}` },
        ]}
      />

      {actionError && (
        <SettingsPanelState
          tone="error"
          title="Thao tác chính sách chưa hoàn tất"
          detail={actionError.message}
        />
      )}

      <SettingsWorkCard
        eyebrow={
          focus.step === 'draft'
            ? 'Bước 2 · soạn bản nháp'
            : focus.step === 'review'
              ? 'Bước 3 · xem lại và quyết định'
              : 'Bước 1 · chọn việc'
        }
        title={focus.title}
        problem={focus.detail}
        tone={focus.tone}
        headingId="settings-policy-work"
        headingRef={workHeading}
        actions={
          <SettingsActionRow
            primary={
              focus.step === 'draft' ? (
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={createMutation.isPending}
                  onClick={handleCreate}
                >
                  {createMutation.isPending ? 'Đang lưu bản nháp…' : focus.primaryLabel}
                </button>
              ) : focus.step === 'review' && selectedRule ? (
                <button
                  type="button"
                  ref={rememberTrigger}
                  className="settings-button settings-button--primary"
                  disabled={Boolean(focus.blockedReason) || activateMutation.isPending}
                  onClick={() => setConfirming(selectedRule)}
                >
                  {focus.primaryLabel}
                </button>
              ) : selectedRule && selectedRule.status !== 'active' ? (
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={previewMutation.isPending}
                  onClick={() => previewMutation.mutate(selectedRule.id)}
                >
                  {previewMutation.isPending ? 'Đang chạy đơn mẫu…' : focus.primaryLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  onClick={() => setEditing(true)}
                >
                  {focus.primaryLabel}
                </button>
              )
            }
            secondary={
              focus.step === 'draft' ? (
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => {
                    setEditing(false);
                    setFormError(undefined);
                    setInvalidKey(undefined);
                  }}
                >
                  Hủy
                </button>
              ) : focus.step === 'review' ? (
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => setPreviewedId(undefined)}
                >
                  Quay lại chạy thử
                </button>
              ) : undefined
            }
            blockedReason={focus.blockedReason}
          />
        }
      >
        <ol className="settings-focus-steps">
          <li data-state={focus.step === 'summary' ? 'current' : 'done'}>Chọn việc</li>
          <li
            data-state={
              focus.step === 'draft' ? 'current' : focus.step === 'review' ? 'done' : 'todo'
            }
          >
            Soạn bản nháp
          </li>
          <li data-state={focus.step === 'review' ? 'current' : 'todo'}>Xem lại &amp; áp dụng</li>
        </ol>

        {focus.step === 'draft' && (
          <div className="settings-focus-grid">
            {RULE_FIELDS.map((field, index) => (
              <label
                key={field.key}
                className={`settings-focus-choice ${
                  invalidKey === field.key ? 'settings-focus-choice--invalid' : ''
                }`}
              >
                <span>
                  {field.label} <small className="settings-muted">({field.unit})</small>
                </span>
                <input
                  id={`settings-rule-${field.key}`}
                  ref={index === 0 ? firstField : undefined}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  aria-invalid={invalidKey === field.key || undefined}
                  value={values[field.key]}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      [field.key]: Number(event.target.value),
                    }));
                    if (invalidKey === field.key) setInvalidKey(undefined);
                  }}
                />
                {invalidKey === field.key && formError && (
                  <span className="settings-focus-choice__error">{formError}</span>
                )}
              </label>
            ))}
          </div>
        )}

        {focus.step === 'review' && previewMutation.data && (
          <section aria-label="Kết quả chạy thử trên đơn mẫu" className="settings-preview-result">
            <div>
              <p className="settings-eyebrow">Đơn mẫu TH2 · chạy thuần, không ghi đơn</p>
              <h4>Kết quả rules sẽ áp dụng</h4>
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
      </SettingsWorkCard>

      <SettingsAdvanced
        title="Khoản chưa mở — chờ quyết định của khách hàng"
        hint={`${BLOCKED_RULES.length} khoản`}
      >
        <p className="settings-muted">
          Cước ship, VAT và phí thu hộ COD chưa có bảng giá/biểu phí chính thức từ khách hàng, nên hệ
          thống <strong>không tự tính</strong> các khoản này: đơn có phát sinh ship/COD/VAT luôn được
          chuyển Sale xử lý trước khi gửi. Các ô nhập đã được gỡ khỏi biểu mẫu để không tạo cảm giác
          “đã cấu hình xong”.
        </p>
        <ul className="settings-blocked-list">
          {BLOCKED_RULES.map((item) => (
            <li key={item.label}>
              {item.label} — <em>chưa cấu hình</em> (chờ {item.blocker})
            </li>
          ))}
        </ul>
      </SettingsAdvanced>

      <SettingsAdvanced title="Các bản đã lưu" hint={`${history.length} bản`}>
        {query.isLoading && (
          <SettingsPanelState title="Đang tải chính sách" detail="Đọc các bản đã lưu…" />
        )}
        {query.error && (
          <SettingsPanelState
            tone="error"
            title="Không tải được chính sách"
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
        {query.isSuccess && history.length === 0 && (
          <p className="settings-muted">Chưa có bản nào khác ngoài bản đang xử lý ở trên.</p>
        )}
        <div className="settings-version-list">
          {history.map((rule) => (
            <button
              key={rule.id}
              type="button"
              className="settings-version-row"
              onClick={() => {
                setSelectedId(rule.id);
                setPreviewedId(undefined);
                setEditing(false);
              }}
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
        </div>
      </SettingsAdvanced>

      {confirming && (
        <SettingsFocusModal
          title={`Áp dụng bản ${confirming.version}?`}
          description="Chỉ đơn mới và lần “Chạy lại” có chủ ý dùng cấu hình này."
          confirmLabel={`Áp dụng bản ${confirming.version}`}
          tone="primary"
          pending={activateMutation.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => activateMutation.mutate(confirming.id)}
        >
          <ul className="settings-confirmation">
            <li>Đơn đã chốt giữ nguyên chính sách tại thời điểm chốt.</li>
            <li>Hoàn tác: áp dụng lại bản trước đó từ danh sách “Các bản đã lưu”.</li>
          </ul>
        </SettingsFocusModal>
      )}
    </div>
  );
}
