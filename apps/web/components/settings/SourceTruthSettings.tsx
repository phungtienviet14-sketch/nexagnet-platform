'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  normalizeSourceTruthChanges,
  settingsApi,
  type SourceTruthResource,
  type SourceTruthRow,
} from '../../lib/settings';
import { SettingsPanelState } from './SettingsPanelState';

type FieldDefinition = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'month' | 'checkbox' | 'select';
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  nullable?: boolean;
  identifier?: boolean;
  defaultValue?: string | number | boolean;
};

type ResourceDefinition = {
  resource: SourceTruthResource;
  label: string;
  shortLabel: string;
  description: string;
  fields: readonly FieldDefinition[];
};

const RESOURCES: readonly ResourceDefinition[] = [
  {
    resource: 'dealers',
    label: 'Đại lý & CTV',
    shortLabel: 'Đại lý',
    description: 'Hồ sơ đối tác và chính sách thanh toán.',
    fields: [
      { key: 'id', label: 'ID đại lý / CTV', required: true, identifier: true },
      { key: 'name', label: 'Tên đại lý / CTV', required: true },
      {
        key: 'tier',
        label: 'Loại đối tác',
        type: 'select',
        required: true,
        defaultValue: 'dai_ly',
        options: [
          { value: 'dai_ly', label: 'Đại lý' },
          { value: 'ctv', label: 'CTV' },
        ],
      },
      {
        key: 'defaultPolicy',
        label: 'Chính sách mặc định',
        type: 'select',
        required: true,
        defaultValue: 'thanh_toan_ngay',
        options: [
          { value: 'cong_no_30', label: 'Công nợ 30 ngày' },
          { value: 'cong_no_45', label: 'Công nợ 45 ngày' },
          { value: 'ky_gui', label: 'Ký gửi' },
          { value: 'thanh_toan_ngay', label: 'Thanh toán ngay' },
          { value: 'cod', label: 'COD' },
        ],
      },
      { key: 'code', label: 'Mã đối tác', nullable: true },
      { key: 'phone', label: 'Số điện thoại', nullable: true },
    ],
  },
  {
    resource: 'groups',
    label: 'Map nhóm Zalo',
    shortLabel: 'Map nhóm',
    description: 'Một nhóm map tới đúng một đại lý để tính giá.',
    fields: [
      { key: 'chatId', label: 'Chat ID', required: true, identifier: true },
      { key: 'name', label: 'Tên nhóm', nullable: true },
      { key: 'branch', label: 'Chi nhánh', nullable: true },
      { key: 'dealerId', label: 'ID đại lý', nullable: true },
      {
        key: 'status',
        label: 'Trạng thái map',
        type: 'select',
        required: true,
        defaultValue: 'pending',
        options: [
          { value: 'pending', label: 'Chờ map' },
          { value: 'mapped', label: 'Đã map' },
          { value: 'ignored', label: 'Bỏ qua' },
        ],
      },
    ],
  },
  {
    resource: 'products',
    label: 'Sản phẩm',
    shortLabel: 'Sản phẩm',
    description: 'Danh mục SKU đóng mà AI được phép nhận diện.',
    fields: [
      { key: 'sku', label: 'SKU', required: true, identifier: true },
      { key: 'name', label: 'Tên sản phẩm', required: true },
      { key: 'unit', label: 'Đơn vị tính', required: true },
      { key: 'description', label: 'Mô tả', nullable: true },
    ],
  },
  {
    resource: 'prices',
    label: 'Bốn cột giá',
    shortLabel: 'Bảng giá',
    description: 'Giá niêm yết, bán lẻ, bán lẻ tối thiểu và đơn giá CTV.',
    fields: [
      { key: 'sku', label: 'SKU', required: true, identifier: true },
      { key: 'wholesale', label: 'Đơn giá CTV', type: 'number', required: true },
      { key: 'minRetailPrice', label: 'Giá bán lẻ tối thiểu', type: 'number', nullable: true },
      { key: 'retailPrice', label: 'Giá bán lẻ', type: 'number', nullable: true },
      { key: 'listPrice', label: 'Giá niêm yết', type: 'number', nullable: true },
      { key: 'validMonth', label: 'Tháng áp dụng', type: 'month', nullable: true },
    ],
  },
  {
    resource: 'overrides',
    label: 'Deal riêng',
    shortLabel: 'Deal riêng',
    description: 'Chỉ áp dụng cho một cặp đại lý và SKU cụ thể.',
    fields: [
      { key: 'dealerId', label: 'ID đại lý', required: true, identifier: true },
      { key: 'sku', label: 'SKU', required: true, identifier: true },
      { key: 'price', label: 'Đơn giá riêng', type: 'number', required: true },
    ],
  },
  {
    resource: 'glossary',
    label: 'Từ điển viết tắt',
    shortLabel: 'Từ điển',
    description: 'Giải nghĩa ngôn ngữ đặt hàng thật, không mở rộng ngoài danh mục.',
    fields: [
      { key: 'term', label: 'Từ viết tắt', required: true, identifier: true },
      { key: 'meaning', label: 'Nghĩa đầy đủ', required: true },
    ],
  },
];

type EditorProps = {
  definition: ResourceDefinition;
  row?: SourceTruthRow;
  isPending: boolean;
  onCancel: () => void;
  onSave: (
    id: string | undefined,
    changes: Readonly<Record<string, string | number | boolean | null>>,
  ) => void;
};

function SourceTruthEditor({ definition, row, isPending, onCancel, onSave }: EditorProps) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(
    () =>
      Object.fromEntries(
        definition.fields.map((field) => [
          field.key,
          row?.fields[field.key] ?? field.defaultValue ?? (field.type === 'checkbox' ? true : ''),
        ]),
      ) as Record<string, string | number | boolean>,
  );
  const [validationError, setValidationError] = useState<string>();

  const handleSave = () => {
    const normalized = normalizeSourceTruthChanges(
      values,
      definition.fields.filter((field) => field.required).map((field) => field.key),
      definition.fields.filter((field) => field.type === 'number').map((field) => field.key),
      definition.fields.filter((field) => field.nullable).map((field) => field.key),
    );
    if (!normalized.success) {
      const field = definition.fields.find((candidate) => normalized.error.includes(candidate.key));
      setValidationError(
        field ? normalized.error.replace(field.key, field.label) : normalized.error,
      );
      return;
    }
    const isPricing = definition.resource === 'prices' || definition.resource === 'overrides';
    if (
      isPricing &&
      !window.confirm(
        'Thay đổi này ảnh hưởng giá của đơn mới. Đơn cũ giữ nguyên snapshot. Lưu dữ liệu?',
      )
    ) {
      return;
    }
    setValidationError(undefined);
    onSave(row?.id, normalized.data);
  };

  return (
    <aside
      className="settings-drawer"
      aria-label={`${row ? 'Sửa' : 'Thêm'} ${definition.shortLabel}`}
    >
      <div className="settings-drawer__head">
        <div>
          <p className="settings-eyebrow">{row ? 'Chỉnh sửa bản ghi' : 'Bản ghi mới'}</p>
          <h3>{definition.label}</h3>
        </div>
        <button type="button" className="settings-text-action" onClick={onCancel}>
          Đóng
        </button>
      </div>
      <div className="settings-form-grid">
        {definition.fields.map((field) => {
          const value = values[field.key];
          if (field.type === 'checkbox') {
            return (
              <label key={field.key} className="settings-checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.checked }))
                  }
                />
                <span>{field.label}</span>
              </label>
            );
          }
          return (
            <label key={field.key} className="settings-field">
              <span>{field.label}</span>
              {field.type === 'select' ? (
                <select
                  value={String(value)}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type ?? 'text'}
                  readOnly={Boolean(row && field.identifier)}
                  min={field.type === 'number' ? 0 : undefined}
                  step={field.type === 'number' ? 1 : undefined}
                  value={String(value)}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                />
              )}
            </label>
          );
        })}
      </div>
      {validationError && (
        <p className="settings-form-error" role="alert">
          {validationError}
        </p>
      )}
      <div className="settings-drawer__actions">
        <button type="button" className="settings-button settings-button--quiet" onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className="settings-button settings-button--primary"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </aside>
  );
}

export function SourceTruthSettings() {
  const queryClient = useQueryClient();
  const [activeResource, setActiveResource] = useState<SourceTruthResource>('dealers');
  const [editorRow, setEditorRow] = useState<SourceTruthRow | null>();
  const query = useQuery({ queryKey: ['settings-source-truth'], queryFn: settingsApi.sourceTruth });
  const definition = RESOURCES.find((item) => item.resource === activeResource) ?? RESOURCES[0]!;
  const section = query.data?.find((item) => item.resource === activeResource);
  const saveMutation = useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id?: string;
      changes: Readonly<Record<string, string | number | boolean | null>>;
    }) => settingsApi.saveSourceTruth(activeResource, id, changes),
    onSuccess: () => {
      setEditorRow(undefined);
      void queryClient.invalidateQueries({ queryKey: ['settings-source-truth'] });
      void queryClient.invalidateQueries({ queryKey: ['settings-summary'] });
    },
  });

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Nguồn sự thật có kiểm soát</p>
          <h2>Đại lý, sản phẩm & giá</h2>
          <p>Dữ liệu ở đây áp dụng ngay cho đơn mới; đơn cũ giữ nguyên giá đã chốt.</p>
        </div>
        <a className="settings-button settings-button--quiet" href="/admin">
          Mở Admin nâng cao
        </a>
      </header>

      <div className="settings-priority-rule" aria-label="Thứ tự ưu tiên giá">
        <span>Deal riêng đại lý + SKU</span>
        <b>ưu tiên hơn</b>
        <span>Đơn giá CTV trong bảng chung</span>
        <b>nếu thiếu</b>
        <span className="settings-danger">Cần Sale nhập tay</span>
      </div>

      <div className="settings-resource-layout">
        <nav className="settings-resource-nav" aria-label="Loại dữ liệu nguồn sự thật">
          {RESOURCES.map((item) => {
            const resourceSection = query.data?.find(
              (candidate) => candidate.resource === item.resource,
            );
            return (
              <button
                key={item.resource}
                type="button"
                aria-current={activeResource === item.resource ? 'page' : undefined}
                onClick={() => {
                  setActiveResource(item.resource);
                  setEditorRow(undefined);
                }}
              >
                <span>{item.shortLabel}</span>
                <small>
                  {resourceSection?.error
                    ? 'Chưa kết nối'
                    : `${resourceSection?.rows.length ?? 0} bản ghi`}
                </small>
              </button>
            );
          })}
        </nav>

        <div className="settings-resource-main">
          <div className="settings-subheading">
            <div>
              <h3>{definition.label}</h3>
              <p>{definition.description}</p>
            </div>
            <button
              type="button"
              className="settings-button settings-button--primary"
              onClick={() => setEditorRow(null)}
            >
              Thêm {definition.shortLabel.toLocaleLowerCase('vi')}
            </button>
          </div>

          {query.isLoading && (
            <SettingsPanelState
              title="Đang tải nguồn sự thật"
              detail="Đọc dữ liệu đang dùng để xử lý đơn mới…"
            />
          )}
          {query.error && (
            <SettingsPanelState
              tone="error"
              title="Không tải được nguồn sự thật"
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
          {section?.error && (
            <SettingsPanelState
              tone="error"
              title={`${definition.label} chưa sẵn sàng`}
              detail={`${section.error}. Các phần cấu hình khác vẫn hoạt động bình thường.`}
            />
          )}
          {query.isSuccess && !section?.error && section?.rows.length === 0 && (
            <SettingsPanelState
              title={`Chưa có ${definition.shortLabel.toLocaleLowerCase('vi')}`}
              detail="Thêm bản ghi đầu tiên hoặc dùng Admin nâng cao để nhập dữ liệu hàng loạt."
            />
          )}
          {section && section.rows.length > 0 && (
            <div className="settings-record-list" role="list">
              {section.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="settings-record-row"
                  role="listitem"
                  onClick={() => setEditorRow(row)}
                >
                  <span>
                    <strong>{row.label}</strong>
                    {row.code && <code>{row.code}</code>}
                  </span>
                  <span className="settings-record-fields">
                    {Object.entries(row.fields)
                      .filter(([key]) => !['id', 'name', 'displayName'].includes(key))
                      .slice(0, 4)
                      .map(([key, value]) => (
                        <small key={key}>
                          {key}: <b>{String(value)}</b>
                        </small>
                      ))}
                  </span>
                  <span aria-hidden="true">Sửa →</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {editorRow !== undefined && (
          <SourceTruthEditor
            key={`${activeResource}-${editorRow?.id ?? 'new'}`}
            definition={definition}
            row={editorRow ?? undefined}
            isPending={saveMutation.isPending}
            onCancel={() => setEditorRow(undefined)}
            onSave={(id, changes) => saveMutation.mutate({ id, changes })}
          />
        )}
      </div>

      {saveMutation.error && (
        <SettingsPanelState
          tone="error"
          title="Chưa lưu được dữ liệu"
          detail={saveMutation.error.message}
        />
      )}
    </div>
  );
}
