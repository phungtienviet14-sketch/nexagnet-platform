'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContentImportManifest,
  ContentLifecycleStatus,
  ContentSnapshotView,
} from '@netviet/shared';
import { useMemo, useState } from 'react';
import { settingsApi } from '../../lib/settings';
import { SettingsPanelState } from './SettingsPanelState';

type Kind = 'asset' | 'faq' | 'advice' | 'link';
type ContentForm = {
  productSku: string;
  title: string;
  question: string;
  body: string;
  url: string;
  mediaKind: string;
  linkKind: string;
};

const EMPTY_MANIFEST = JSON.stringify(
  {
    source: { kind: 'local_manifest', sourceId: 'inventory-YYYY-MM', version: '1' },
    assets: [],
    faqs: [],
    advice: [],
    links: [],
  },
  null,
  2,
);

const EMPTY_FORM: ContentForm = {
  productSku: '',
  title: '',
  question: '',
  body: '',
  url: '',
  mediaKind: 'image',
  linkKind: 'catalog',
};

export function ContentSettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['settings-content'], queryFn: settingsApi.content });
  const [manifestText, setManifestText] = useState(EMPTY_MANIFEST);
  const [manifestError, setManifestError] = useState<string>();
  const [preview, setPreview] =
    useState<Awaited<ReturnType<typeof settingsApi.previewContentImport>>>();
  const [formKind, setFormKind] = useState<Kind>('faq');
  const [form, setForm] = useState<ContentForm>(EMPTY_FORM);
  const refresh = async (snapshot?: ContentSnapshotView) => {
    if (snapshot) client.setQueryData(['settings-content'], snapshot);
    else await query.refetch();
  };
  const statusMutation = useMutation({
    mutationFn: ({
      kind,
      id,
      status,
    }: {
      kind: Kind;
      id: string;
      status: ContentLifecycleStatus;
    }) => settingsApi.setContentStatus(kind, id, status),
    onSuccess: refresh,
  });
  const saveMutation = useMutation({
    mutationFn: () => settingsApi.saveContent(formKind, formPayload(formKind, form)),
    onSuccess: async (snapshot) => {
      await refresh(snapshot);
      setForm(EMPTY_FORM);
    },
  });
  const previewMutation = useMutation({
    mutationFn: settingsApi.previewContentImport,
    onSuccess: setPreview,
  });
  const applyMutation = useMutation({
    mutationFn: settingsApi.applyContentImport,
    onSuccess: async () => {
      setPreview(undefined);
      await refresh();
    },
  });
  const reloadMutation = useMutation({ mutationFn: settingsApi.reloadContent, onSuccess: refresh });
  const records = useMemo(() => (query.data ? flatten(query.data) : []), [query.data]);
  const error =
    query.error ??
    statusMutation.error ??
    saveMutation.error ??
    previewMutation.error ??
    applyMutation.error;

  if (query.isLoading) {
    return (
      <SettingsPanelState
        title="Đang tải kho nội dung"
        detail="Đang đọc FAQ, media, link và trạng thái sẵn sàng từ nguồn sự thật."
      />
    );
  }
  if (!query.data) {
    return (
      <SettingsPanelState
        tone="error"
        title="Không tải được kho nội dung"
        detail={error instanceof Error ? error.message : 'Thử tải lại.'}
        action={<button onClick={() => query.refetch()}>Thử lại</button>}
      />
    );
  }
  const snapshot = query.data;

  const readManifest = (): ContentImportManifest | null => {
    try {
      const parsed = JSON.parse(manifestText) as ContentImportManifest;
      setManifestError(undefined);
      return parsed;
    } catch {
      setManifestError('JSON manifest không hợp lệ. Kiểm tra dấu ngoặc và dấu phẩy.');
      return null;
    }
  };

  return (
    <div className="settings-content">
      <header className="settings-section-heading">
        <div>
          <span className="settings-kicker">FAQ · MEDIA · CATALOG</span>
          <h2>Kho nội dung sản phẩm</h2>
          <p>
            Chỉ nội dung Active mới được agent dùng. Ảnh, video và PDF nằm ở Drive/object storage;
            hệ thống chỉ giữ locator và provenance.
          </p>
        </div>
        <button
          type="button"
          className="settings-button settings-button--quiet"
          onClick={() => reloadMutation.mutate()}
        >
          Reload không restart
        </button>
      </header>

      {(error || manifestError) && (
        <div className="settings-shell__warning" role="alert">
          {manifestError ?? (error instanceof Error ? error.message : 'Thao tác thất bại')}
        </div>
      )}

      <section className="settings-content-readiness" aria-label="Mức sẵn sàng nội dung">
        <h3>Sản phẩm còn thiếu dữ liệu</h3>
        {snapshot.readiness.length === 0 ? (
          <p>Chưa có SKU để đánh giá.</p>
        ) : (
          <div className="settings-content-readiness__grid">
            {snapshot.readiness.map((item) => (
              <article key={item.productSku ?? 'global'}>
                <strong>{item.productSku ?? 'Toàn công ty'}</strong>
                <span className={item.ready ? 'is-ready' : 'is-missing'}>
                  {item.ready ? 'Sẵn sàng' : `Thiếu: ${item.missing.join(', ')}`}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="settings-content-editor">
        <h3>Nhập nội dung operator</h3>
        <div className="settings-content-editor__fields">
          <label>
            Loại
            <select value={formKind} onChange={(event) => setFormKind(event.target.value as Kind)}>
              <option value="faq">FAQ</option>
              <option value="advice">Nội dung tư vấn</option>
              <option value="asset">Media locator</option>
              <option value="link">Video/catalog/company profile</option>
            </select>
          </label>
          <label>
            SKU (để trống nếu dùng chung)
            <input
              value={form.productSku}
              onChange={(event) => setForm({ ...form, productSku: event.target.value })}
            />
          </label>
          {formKind === 'faq' ? (
            <label>
              Câu hỏi
              <input
                value={form.question}
                onChange={(event) => setForm({ ...form, question: event.target.value })}
              />
            </label>
          ) : (
            <label>
              Tiêu đề
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </label>
          )}
          {(formKind === 'faq' || formKind === 'advice') && (
            <label className="settings-content-editor__wide">
              Nội dung
              <textarea
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
              />
            </label>
          )}
          {(formKind === 'asset' || formKind === 'link') && (
            <label className="settings-content-editor__wide">
              URL / locator
              <input
                type="url"
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
              />
            </label>
          )}
          {formKind === 'asset' && (
            <label>
              Kiểu media
              <select
                value={form.mediaKind}
                onChange={(event) => setForm({ ...form, mediaKind: event.target.value })}
              >
                <option value="image">Ảnh</option>
                <option value="video">Video</option>
                <option value="pdf">PDF</option>
                <option value="catalog">Catalog</option>
                <option value="company_profile">Company profile</option>
              </select>
            </label>
          )}
          {formKind === 'link' && (
            <label>
              Kiểu link
              <select
                value={form.linkKind}
                onChange={(event) => setForm({ ...form, linkKind: event.target.value })}
              >
                <option value="video">Video</option>
                <option value="catalog">Catalog</option>
                <option value="company_profile">Company profile</option>
              </select>
            </label>
          )}
        </div>
        <button type="button" className="settings-button" onClick={() => saveMutation.mutate()}>
          Lưu bản nháp
        </button>
      </section>

      <section className="settings-content-list">
        <h3>Nội dung, mapping và provenance</h3>
        {records.length === 0 && <p>Chưa có nội dung. Có thể nhập tay hoặc import inventory.</p>}
        {records.map((record) => (
          <article key={`${record.kind}:${record.id}`}>
            <div>
              <small>
                {record.kind.toUpperCase()} · {record.productSku || 'Dùng chung'}
              </small>
              <strong>{record.label}</strong>
              <p>{record.detail}</p>
              <code>{record.provenanceKey ?? 'operator'}</code>
            </div>
            <div className="settings-content-list__actions">
              <span>{record.status}</span>
              {nextActions(record.status).map((action) => (
                <button
                  key={action.status}
                  type="button"
                  onClick={() =>
                    statusMutation.mutate({
                      kind: record.kind,
                      id: record.id,
                      status: action.status,
                    })
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="settings-content-import">
        <h3>Import inventory qua ContentSourcePort</h3>
        <p>
          Preview/diff trước khi ghi; chạy lại không duplicate và không ghi đè nội dung Sale sửa.
        </p>
        <textarea
          aria-label="Manifest nội dung"
          value={manifestText}
          onChange={(event) => setManifestText(event.target.value)}
        />
        <div>
          <button
            type="button"
            onClick={() => {
              const manifest = readManifest();
              if (manifest) previewMutation.mutate(manifest);
            }}
          >
            Preview
          </button>
          <button
            type="button"
            disabled={!preview || preview.errors.length > 0}
            onClick={() => {
              const manifest = readManifest();
              if (manifest) applyMutation.mutate(manifest);
            }}
          >
            Xác nhận import
          </button>
        </div>
        {preview && (
          <p role="status">
            Tạo {preview.creates} · cập nhật {preview.updates} · không đổi {preview.unchanged} ·
            xung đột {preview.conflicts}
          </p>
        )}
      </section>
    </div>
  );
}

function formPayload(kind: Kind, form: ContentForm): Record<string, unknown> {
  const productSku = form.productSku.trim() || undefined;
  if (kind === 'faq') {
    return { productSku, question: form.question, answer: form.body, status: 'draft' };
  }
  if (kind === 'advice') {
    return { productSku, title: form.title, body: form.body, status: 'draft' };
  }
  if (kind === 'asset') {
    return {
      kind: form.mediaKind,
      title: form.title,
      locator: form.url,
      productSkus: productSku ? [productSku] : [],
      status: 'draft',
    };
  }
  return {
    productSku,
    kind: form.linkKind,
    title: form.title,
    url: form.url,
    status: 'draft',
  };
}

function nextActions(
  status: ContentLifecycleStatus,
): { status: ContentLifecycleStatus; label: string }[] {
  if (status === 'draft') return [{ status: 'reviewed', label: 'Đưa duyệt' }];
  if (status === 'reviewed') {
    return [
      { status: 'approved', label: 'Duyệt' },
      { status: 'draft', label: 'Trả về nháp' },
    ];
  }
  if (status === 'approved') {
    return [
      { status: 'active', label: 'Kích hoạt' },
      { status: 'reviewed', label: 'Bỏ duyệt' },
    ];
  }
  return [{ status: 'reviewed', label: 'Bỏ duyệt' }];
}

function flatten(snapshot: ContentSnapshotView) {
  return [
    ...snapshot.faqs.map((item) => ({
      ...item,
      kind: 'faq' as const,
      label: item.question,
      detail: item.answer,
    })),
    ...snapshot.advice.map((item) => ({
      ...item,
      kind: 'advice' as const,
      label: item.title,
      detail: item.body,
    })),
    ...snapshot.assets.map((item) => ({
      ...item,
      kind: 'asset' as const,
      productSku: item.productSkus.join(', '),
      label: item.title ?? item.externalId,
      detail: item.locator,
    })),
    ...snapshot.links.map((item) => ({
      ...item,
      kind: 'link' as const,
      label: item.title,
      detail: item.url,
    })),
  ];
}
