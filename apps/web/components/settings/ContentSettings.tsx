'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContentImportManifest,
  ContentLifecycleStatus,
  ContentSnapshotView,
} from '@netviet/shared';
import { useMemo, useRef, useState } from 'react';
import { settingsApi } from '../../lib/settings';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsStatusBar,
  SettingsWorkCard,
  useFocusOnKey,
  useRestoreFocus,
} from './SettingsFocus';
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

const KIND_LABELS: Readonly<Record<Kind, string>> = {
  faq: 'Câu hỏi thường gặp',
  advice: 'Nội dung tư vấn',
  asset: 'Ảnh / video / PDF',
  link: 'Video, catalog, hồ sơ công ty',
};

/**
 * Kho noi dung co HAI che do lam viec, khong phai bon khoi mo san (#146 §4):
 *
 *  - `gap`    — bu mot cho con thieu: chon san pham thieu -> mo dung mot o soan -> luu nhap;
 *  - `browse` — tra cuu/quan ly: chon mot ban ghi -> mo dung be mat vong doi cua ban ghi do.
 *
 * Bieu mau soan KHONG con mo thuong truc: mo mot bieu mau trong khi nguoi dung chua chon viec la
 * cach nhanh nhat de bien mot man hinh thanh mot bang du lieu.
 *
 * Nhap hang loat tro thanh "Nâng cao", va `Xác nhận import` chi mo ra khi da co ket qua xem truoc
 * cua CHINH manifest dang o trong o.
 */
export function ContentSettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['settings-content'], queryFn: settingsApi.content });
  const [manifestText, setManifestText] = useState(EMPTY_MANIFEST);
  const [manifestError, setManifestError] = useState<string>();
  const [preview, setPreview] =
    useState<Awaited<ReturnType<typeof settingsApi.previewContentImport>>>();
  const [previewedText, setPreviewedText] = useState<string>();
  const [editor, setEditor] = useState<{ kind: Kind; sku: string } | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string>();
  const [form, setForm] = useState<ContentForm>(EMPTY_FORM);

  const refresh = async (snapshot?: ContentSnapshotView) => {
    if (snapshot) client.setQueryData(['settings-content'], snapshot);
    else await query.refetch();
  };
  const statusMutation = useMutation({
    mutationFn: ({ kind, id, status }: { kind: Kind; id: string; status: ContentLifecycleStatus }) =>
      settingsApi.setContentStatus(kind, id, status),
    onSuccess: refresh,
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.saveContent(editor?.kind ?? 'faq', formPayload(editor?.kind ?? 'faq', form)),
    onSuccess: async (snapshot) => {
      await refresh(snapshot);
      setForm(EMPTY_FORM);
      setEditor(null);
    },
  });
  const previewMutation = useMutation({
    mutationFn: settingsApi.previewContentImport,
    onSuccess: (result) => {
      setPreview(result);
      setPreviewedText(manifestText);
    },
  });
  const applyMutation = useMutation({
    mutationFn: settingsApi.applyContentImport,
    onSuccess: async () => {
      setPreview(undefined);
      setPreviewedText(undefined);
      await refresh();
    },
  });
  const reloadMutation = useMutation({ mutationFn: settingsApi.reloadContent, onSuccess: refresh });

  const records = useMemo(() => (query.data ? flatten(query.data) : []), [query.data]);
  const selectedRecord = records.find((record) => `${record.kind}:${record.id}` === selectedRecordId);

  const workHeading = useRef<HTMLHeadingElement>(null);
  const { rememberTrigger } = useRestoreFocus(Boolean(editor) || Boolean(selectedRecord));
  useFocusOnKey(
    workHeading,
    editor ? `content-edit:${editor.kind}:${editor.sku}` : (selectedRecordId ?? 'content-gap'),
  );

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
        detail="Đang đọc câu trả lời sẵn, hình ảnh, link và mức sẵn sàng của từng sản phẩm."
      />
    );
  }
  if (!query.data) {
    return (
      <SettingsPanelState
        tone="error"
        title="Không tải được kho nội dung"
        detail={error instanceof Error ? error.message : 'Thử tải lại.'}
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
    );
  }

  const snapshot = query.data;
  const gaps = snapshot.readiness.filter((item) => !item.ready);
  const nextGap = gaps[0];

  const readManifest = (): ContentImportManifest | null => {
    try {
      const parsed = JSON.parse(manifestText) as ContentImportManifest;
      setManifestError(undefined);
      return parsed;
    } catch {
      setManifestError('Nội dung dán vào chưa đúng định dạng. Kiểm tra dấu ngoặc và dấu phẩy.');
      return null;
    }
  };

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Câu trả lời sẵn · hình ảnh · tư vấn</p>
          <h2>Nội dung &amp; kiến thức</h2>
          <p>Chỉ nội dung đã kích hoạt mới được hệ thống dùng khi trả lời khách.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone={gaps.length > 0 ? 'attention' : 'ok'}
        title={
          gaps.length > 0
            ? `${gaps.length} sản phẩm còn thiếu nội dung`
            : 'Mọi sản phẩm đều đã đủ nội dung'
        }
        detail="Ảnh, video và PDF nằm ở kho lưu trữ ngoài; hệ thống chỉ giữ đường dẫn và nguồn gốc."
        facts={[
          { label: 'Bản ghi', value: `${records.length}` },
          { label: 'Sản phẩm đã đủ', value: `${snapshot.readiness.length - gaps.length}` },
        ]}
      />

      {(error || manifestError) && (
        <SettingsPanelState
          tone="error"
          title="Thao tác nội dung chưa hoàn tất"
          detail={manifestError ?? (error instanceof Error ? error.message : 'Thao tác thất bại')}
        />
      )}

      {editor ? (
        <SettingsWorkCard
          eyebrow="Đang soạn nội dung"
          title={`${KIND_LABELS[editor.kind]}${editor.sku ? ` cho ${editor.sku}` : ''}`}
          problem="Nội dung mới luôn được lưu ở trạng thái nháp; hệ thống chưa dùng cho tới khi kích hoạt."
          headingId="settings-content-work"
          headingRef={workHeading}
          actions={
            <SettingsActionRow
              primary={
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
                </button>
              }
              secondary={
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => {
                    setEditor(null);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Hủy
                </button>
              }
            />
          }
        >
          <div className="settings-focus-grid">
            <label className="settings-focus-choice">
              <span>Loại nội dung</span>
              <select
                value={editor.kind}
                onChange={(event) => setEditor({ ...editor, kind: event.target.value as Kind })}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-focus-choice">
              <span>Mã sản phẩm (để trống nếu dùng chung)</span>
              <input
                value={form.productSku}
                onChange={(event) => setForm({ ...form, productSku: event.target.value })}
              />
            </label>
            {editor.kind === 'faq' ? (
              <label className="settings-focus-choice">
                <span>Câu hỏi của khách</span>
                <input
                  value={form.question}
                  onChange={(event) => setForm({ ...form, question: event.target.value })}
                />
              </label>
            ) : (
              <label className="settings-focus-choice">
                <span>Tiêu đề</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </label>
            )}
            {editor.kind === 'asset' && (
              <label className="settings-focus-choice">
                <span>Kiểu tệp</span>
                <select
                  value={form.mediaKind}
                  onChange={(event) => setForm({ ...form, mediaKind: event.target.value })}
                >
                  <option value="image">Ảnh</option>
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                  <option value="catalog">Catalog</option>
                  <option value="company_profile">Hồ sơ công ty</option>
                </select>
              </label>
            )}
            {editor.kind === 'link' && (
              <label className="settings-focus-choice">
                <span>Kiểu link</span>
                <select
                  value={form.linkKind}
                  onChange={(event) => setForm({ ...form, linkKind: event.target.value })}
                >
                  <option value="video">Video</option>
                  <option value="catalog">Catalog</option>
                  <option value="company_profile">Hồ sơ công ty</option>
                </select>
              </label>
            )}
          </div>
          {(editor.kind === 'faq' || editor.kind === 'advice') && (
            <label className="settings-focus-choice">
              <span>Nội dung trả lời</span>
              <textarea
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
              />
            </label>
          )}
          {(editor.kind === 'asset' || editor.kind === 'link') && (
            <label className="settings-focus-choice">
              <span>Đường dẫn tệp</span>
              <input
                type="url"
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
              />
            </label>
          )}
        </SettingsWorkCard>
      ) : selectedRecord ? (
        <SettingsWorkCard
          eyebrow="Đang quản lý một nội dung"
          title={selectedRecord.label}
          problem={`Trạng thái hiện tại: ${LIFECYCLE_LABELS[selectedRecord.status] ?? selectedRecord.status}. Chỉ nội dung đã kích hoạt mới được dùng khi trả lời khách.`}
          headingId="settings-content-work"
          headingRef={workHeading}
          actions={
            <SettingsActionRow
              primary={
                nextActions(selectedRecord.status)[0] ? (
                  <button
                    type="button"
                    className="settings-button settings-button--primary"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({
                        kind: selectedRecord.kind,
                        id: selectedRecord.id,
                        status: nextActions(selectedRecord.status)[0]!.status,
                      })
                    }
                  >
                    {nextActions(selectedRecord.status)[0]!.label}
                  </button>
                ) : undefined
              }
              secondary={
                nextActions(selectedRecord.status)[1] ? (
                  <button
                    type="button"
                    className="settings-button settings-button--quiet"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({
                        kind: selectedRecord.kind,
                        id: selectedRecord.id,
                        status: nextActions(selectedRecord.status)[1]!.status,
                      })
                    }
                  >
                    {nextActions(selectedRecord.status)[1]!.label}
                  </button>
                ) : undefined
              }
              tertiary={
                <button
                  type="button"
                  className="settings-text-action"
                  onClick={() => setSelectedRecordId(undefined)}
                >
                  Đóng
                </button>
              }
            />
          }
        >
          <p>{selectedRecord.detail}</p>
          <SettingsAdvanced title="Nguồn gốc nội dung">
            <p className="settings-muted">
              Mã sản phẩm: <code>{selectedRecord.productSku || 'dùng chung'}</code> · nguồn:{' '}
              <code>{selectedRecord.provenanceKey ?? 'người vận hành nhập tay'}</code>
            </p>
          </SettingsAdvanced>
        </SettingsWorkCard>
      ) : (
        <SettingsWorkCard
          eyebrow={nextGap ? 'Chỗ còn thiếu nên bù trước' : 'Không còn chỗ nào thiếu'}
          title={
            nextGap
              ? `${nextGap.productSku ?? 'Nội dung dùng chung'} còn thiếu ${nextGap.missing.join(', ')}`
              : 'Mọi sản phẩm đều đã đủ nội dung'
          }
          problem={
            nextGap
              ? 'Thiếu nội dung thì khi khách hỏi về sản phẩm này, hệ thống phải chuyển việc cho Sale.'
              : 'Có thể thêm nội dung mới bất cứ lúc nào, hoặc chọn một bản ghi bên dưới để sửa.'
          }
          tone={nextGap ? 'attention' : 'ok'}
          headingId="settings-content-work"
          headingRef={workHeading}
          actions={
            <SettingsActionRow
              primary={
                <button
                  type="button"
                  ref={rememberTrigger}
                  className="settings-button settings-button--primary"
                  onClick={() => {
                    const sku = nextGap?.productSku ?? '';
                    setForm({ ...EMPTY_FORM, productSku: sku });
                    setSelectedRecordId(undefined);
                    setEditor({ kind: nextGap?.missing.includes('faq') ? 'faq' : 'asset', sku });
                  }}
                >
                  {nextGap ? 'Bổ sung nội dung cho sản phẩm này' : 'Thêm nội dung mới'}
                </button>
              }
            />
          }
        />
      )}

      {/* Cac cho thieu CON LAI nam NGOAI the viec: long mot danh sach vao trong khoi noi bat lam
          no doc ra nhu hai vung thao tac chong nhau. */}
      {!editor && !selectedRecord && gaps.length > 1 && (
        <section aria-labelledby="settings-content-queue">
          <div className="settings-subheading">
            <h3 id="settings-content-queue">Làm tiếp sau đó</h3>
            <span className="settings-count">{gaps.length - 1} sản phẩm</span>
          </div>
          <ul className="settings-focus-queue">
            {gaps.slice(1).map((item) => (
              <li key={item.productSku ?? 'global'}>
                <div>
                  <strong>{item.productSku ?? 'Nội dung dùng chung'}</strong>
                </div>
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={(event) => {
                    rememberTrigger(event.currentTarget);
                    const sku = item.productSku ?? '';
                    setForm({ ...EMPTY_FORM, productSku: sku });
                    setEditor({ kind: item.missing.includes('faq') ? 'faq' : 'asset', sku });
                  }}
                >
                  Bổ sung
                </button>
                <small>Thiếu: {item.missing.join(', ')}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SettingsAdvanced
        title="Toàn bộ nội dung đã có"
        hint={`${records.length} bản ghi`}
        defaultOpen={gaps.length === 0}
      >
        {records.length === 0 ? (
          <p className="settings-muted">
            Chưa có nội dung nào. Có thể nhập tay ở trên hoặc nhập hàng loạt ở mục nâng cao.
          </p>
        ) : (
          <ul className="settings-focus-queue">
            {records.map((record) => (
              <li key={`${record.kind}:${record.id}`}>
                <div>
                  <span className="settings-version-chip">{KIND_LABELS[record.kind]}</span>{' '}
                  <strong>{record.label}</strong>
                </div>
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  aria-current={selectedRecordId === `${record.kind}:${record.id}` || undefined}
                  onClick={(event) => {
                    rememberTrigger(event.currentTarget);
                    setEditor(null);
                    setSelectedRecordId(`${record.kind}:${record.id}`);
                  }}
                >
                  Quản lý
                </button>
                <small>
                  {LIFECYCLE_LABELS[record.status] ?? record.status} ·{' '}
                  {record.productSku || 'dùng chung'}
                </small>
              </li>
            ))}
          </ul>
        )}
      </SettingsAdvanced>

      <SettingsAdvanced title="Nhập hàng loạt (nâng cao)" hint="Xem trước rồi mới ghi">
        <p className="settings-muted">
          Xem trước và đối chiếu trước khi ghi; chạy lại không tạo bản trùng và không ghi đè nội dung
          người vận hành đã sửa.
        </p>
        <label className="settings-focus-choice">
          <span>Nội dung nhập hàng loạt</span>
          <textarea
            aria-label="Nội dung nhập hàng loạt"
            rows={8}
            value={manifestText}
            onChange={(event) => {
              setManifestText(event.target.value);
              // Sua noi dung sau khi xem truoc => ket qua cu het hieu luc, nut ghi dong lai.
              setPreview(undefined);
              setPreviewedText(undefined);
            }}
          />
        </label>
        {preview && (
          <p role="status" className="settings-muted">
            Tạo mới {preview.creates} · cập nhật {preview.updates} · không đổi {preview.unchanged} ·
            xung đột {preview.conflicts}
          </p>
        )}
        <SettingsActionRow
          primary={
            <button
              type="button"
              className="settings-button settings-button--primary"
              disabled={previewMutation.isPending}
              onClick={() => {
                const manifest = readManifest();
                if (manifest) previewMutation.mutate(manifest);
              }}
            >
              {previewMutation.isPending ? 'Đang xem trước…' : 'Xem trước thay đổi'}
            </button>
          }
          secondary={
            // Chi hien sau khi CHINH noi dung dang o trong o da duoc xem truoc va khong co loi.
            preview && preview.errors.length === 0 && previewedText === manifestText ? (
              <button
                type="button"
                className="settings-button settings-button--quiet"
                disabled={applyMutation.isPending}
                onClick={() => {
                  const manifest = readManifest();
                  if (manifest) applyMutation.mutate(manifest);
                }}
              >
                {applyMutation.isPending ? 'Đang ghi…' : 'Ghi thay đổi vào hệ thống'}
              </button>
            ) : undefined
          }
          blockedReason={
            preview && previewedText === manifestText
              ? undefined
              : 'Xem trước thay đổi trước, rồi mới ghi được.'
          }
          tertiary={
            <button
              type="button"
              className="settings-text-action"
              disabled={reloadMutation.isPending}
              onClick={() => reloadMutation.mutate()}
            >
              Nạp lại nội dung
            </button>
          }
        />
      </SettingsAdvanced>
    </div>
  );
}

const LIFECYCLE_LABELS: Readonly<Record<string, string>> = {
  draft: 'Bản nháp',
  reviewed: 'Đã đưa duyệt',
  approved: 'Đã duyệt',
  active: 'Đang dùng',
};

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
  return { productSku, kind: form.linkKind, title: form.title, url: form.url, status: 'draft' };
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
