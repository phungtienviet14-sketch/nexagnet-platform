'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import {
  canCancelCampaign,
  resolveCampaignAction,
  resolveComposeStep,
} from '../../lib/settings-focus';
import {
  settingsApi,
  type CampaignKind,
  type CampaignView,
  type JsonObject,
  type SettingsGroupSummary,
} from '../../lib/settings';
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

const KIND_LABELS: Readonly<Record<CampaignKind, string>> = {
  one_off: 'Một lần',
  recurring: 'Định kỳ',
  birthday: 'Sinh nhật',
  lunar_month_start: 'Mùng 1 âm lịch',
  lunar_full_moon: 'Ngày rằm',
};

const STATUS_LABELS: Readonly<Record<CampaignView['status'], string>> = {
  draft: 'Bản nháp',
  approved: 'Đã duyệt',
  scheduled: 'Đã lên lịch',
  running: 'Đang gửi',
  completed: 'Hoàn tất',
  partially_failed: 'Có lỗi',
  cancelled: 'Đã hủy',
};

interface Props {
  groups: readonly SettingsGroupSummary[];
}

type Mode = { kind: 'idle' } | { kind: 'compose' } | { kind: 'manage'; campaignId: string };

/**
 * Chien dich cham soc — soan theo BUOC, quan ly theo TRANG THAI (#146 §5).
 *
 * Hai thay doi lon so voi ban cu:
 *  1. bieu mau soan khong con mo thuong truc; khi da mo thi no la khoi noi bat va danh sach chien
 *     dich tut xuong thanh boi canh;
 *  2. moi chien dich chi lo ra DUNG MOT hanh dong hop le voi trang thai cua no
 *     (`resolveCampaignAction`), thay vi bay ca `Duyệt`, hai o lich, `Lên lịch` va `Hủy` cung luc.
 *
 * Quy tac lich gui / gian cach / gioi han cua may chu KHONG doi.
 */
export function CampaignSettings({ groups }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<CampaignKind>('one_off');
  const [templateKey, setTemplateKey] = useState('');
  const [recurrenceJson, setRecurrenceJson] = useState('{}');
  const [selectedGroups, setSelectedGroups] = useState<readonly string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [cancelling, setCancelling] = useState<CampaignView | null>(null);
  const [approving, setApproving] = useState<CampaignView | null>(null);

  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: settingsApi.campaigns });
  const policy = useQuery({ queryKey: ['campaign-policy'], queryFn: settingsApi.campaignPolicy });
  const selectableGroups = useMemo(
    () => groups.filter((group) => group.status === 'mapped' && group.allowed),
    [groups],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  const create = useMutation({
    mutationFn: settingsApi.createCampaign,
    onSuccess: () => {
      setName('');
      setContent('');
      setSelectedGroups([]);
      setReviewed(false);
      setMode({ kind: 'idle' });
      void refresh();
    },
  });
  const approve = useMutation({
    mutationFn: settingsApi.approveCampaign,
    onSuccess: () => {
      setApproving(null);
      void refresh();
    },
  });
  const schedule = useMutation({
    mutationFn: (id: string) =>
      settingsApi.scheduleCampaign(id, {
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
      }),
    onSuccess: refresh,
  });
  const retry = useMutation({ mutationFn: settingsApi.retryFailedCampaign, onSuccess: refresh });
  const cancel = useMutation({
    mutationFn: settingsApi.cancelCampaign,
    onSuccess: () => {
      setCancelling(null);
      void refresh();
    },
  });

  const list = campaigns.data ?? [];
  const selected =
    mode.kind === 'manage' ? list.find((row) => row.id === mode.campaignId) : undefined;
  const step = resolveComposeStep({
    name,
    content,
    targetCount: selectedGroups.length,
    reviewed,
  });

  const workHeading = useRef<HTMLHeadingElement>(null);
  const { rememberTrigger } = useRestoreFocus(mode.kind !== 'idle');
  useFocusOnKey(
    workHeading,
    mode.kind === 'compose' ? `campaign-compose:${step}` : `campaign:${mode.kind}:${selected?.id ?? ''}`,
  );

  const parseRecurrence = (): JsonObject | undefined => {
    if (kind === 'one_off') return undefined;
    try {
      const parsed: unknown = JSON.parse(recurrenceJson);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      return parsed as JsonObject;
    } catch {
      setFormError('Cấu hình lịch nâng cao chưa đúng định dạng.');
      return undefined;
    }
  };

  const prepareDraft = () => {
    if (!name.trim() || !content.trim()) {
      setFormError('Cần nhập tên và nội dung chiến dịch.');
      return undefined;
    }
    if (selectedGroups.length === 0) {
      setFormError('Cần chọn ít nhất một nhóm đã gán đại lý và được phép gửi.');
      return undefined;
    }
    const recurrence = parseRecurrence();
    if (kind !== 'one_off' && recurrence === undefined) return undefined;
    setFormError(undefined);
    return {
      name: name.trim(),
      content: content.trim(),
      kind,
      ...(templateKey.trim() ? { templateKey: templateKey.trim() } : {}),
      ...(recurrence ? { recurrence } : {}),
      targets: selectedGroups.map((groupId) => {
        const group = selectableGroups.find((row) => row.id === groupId);
        return {
          groupId,
          chatId: group?.zcaChatId ?? groupId,
          ...(group?.name ? { displayName: group.name } : {}),
          metadata: {},
        };
      }),
      metadata: {},
    };
  };

  const actionError = create.error ?? approve.error ?? schedule.error ?? retry.error ?? cancel.error;
  const drafts = list.filter((row) => row.status === 'draft' || row.status === 'approved');

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Soạn · duyệt · lên lịch</p>
          <h2>Chiến dịch chăm sóc</h2>
          <p>Nội dung gửi hàng loạt cho nhóm đại lý, luôn qua một bước duyệt của người.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone={drafts.length > 0 ? 'attention' : 'ok'}
        title={
          drafts.length > 0
            ? `${drafts.length} chiến dịch đang chờ bước tiếp theo`
            : 'Không có chiến dịch nào đang chờ xử lý'
        }
        detail="Hệ thống không tự gửi: mỗi chiến dịch phải được duyệt rồi lên lịch mới chạy."
        facts={[
          { label: 'Tổng số', value: `${list.length}` },
          { label: 'Nhóm gửi được', value: `${selectableGroups.length}` },
          ...(policy.data
            ? [{ label: 'Tối đa mỗi lần', value: `${policy.data.maxTargets} nhóm` }]
            : []),
        ]}
      />

      {actionError && (
        <SettingsPanelState
          tone="error"
          title="Thao tác chiến dịch chưa hoàn tất"
          detail={actionError.message}
        />
      )}

      {mode.kind === 'compose' ? (
        <SettingsWorkCard
          eyebrow={
            step === 'compose'
              ? 'Bước 1 · nội dung'
              : step === 'targets'
                ? 'Bước 2 · nhóm nhận'
                : 'Bước 3 · xem lại'
          }
          title="Soạn chiến dịch mới"
          problem={
            step === 'compose'
              ? 'Nhập tên và nội dung sẽ gửi cho khách.'
              : step === 'targets'
                ? 'Chọn các nhóm sẽ nhận nội dung này.'
                : 'Đọc lại đúng nội dung khách sẽ nhận, rồi lưu thành bản nháp.'
          }
          headingId="settings-campaign-work"
          headingRef={workHeading}
          actions={
            <SettingsActionRow
              primary={
                step === 'review' ? (
                  <button
                    type="button"
                    className="settings-button settings-button--primary"
                    disabled={create.isPending}
                    onClick={() => {
                      const draft = prepareDraft();
                      if (draft) create.mutate(draft);
                    }}
                  >
                    {create.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="settings-button settings-button--primary"
                    disabled={step === 'compose'}
                    onClick={() => {
                      if (prepareDraft()) setReviewed(true);
                    }}
                  >
                    Xem lại trước khi lưu
                  </button>
                )
              }
              secondary={
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => {
                    setMode({ kind: 'idle' });
                    setReviewed(false);
                  }}
                >
                  Hủy
                </button>
              }
              blockedReason={
                step === 'compose'
                  ? 'Nhập tên và nội dung trước.'
                  : step === 'targets'
                    ? 'Chọn ít nhất một nhóm nhận.'
                    : undefined
              }
            />
          }
        >
          <ol className="settings-focus-steps">
            <li data-state={step === 'compose' ? 'current' : 'done'}>Nội dung</li>
            <li
              data-state={step === 'targets' ? 'current' : step === 'review' ? 'done' : 'todo'}
            >
              Nhóm nhận
            </li>
            <li data-state={step === 'review' ? 'current' : 'todo'}>Xem lại</li>
          </ol>

          {step === 'review' ? (
            <section className="settings-preview-result" aria-label="Nội dung khách sẽ nhận">
              <div>
                <p className="settings-eyebrow">Khách sẽ nhận đúng nội dung này</p>
                <h4>{name}</h4>
              </div>
              <div>
                <span>
                  <small>Số nhóm</small>
                  <strong>{selectedGroups.length}</strong>
                </span>
                <span>
                  <small>Loại lịch</small>
                  <strong>{KIND_LABELS[kind]}</strong>
                </span>
                <p>{content}</p>
              </div>
            </section>
          ) : (
            <>
              <div className="settings-focus-grid">
                <label className="settings-focus-choice">
                  <span>Tên chiến dịch</span>
                  <input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setReviewed(false);
                    }}
                  />
                </label>
                <label className="settings-focus-choice">
                  <span>Loại lịch</span>
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value as CampaignKind)}
                  >
                    {Object.entries(KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="settings-focus-choice">
                <span>Nội dung gửi</span>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setReviewed(false);
                  }}
                />
              </label>
              <fieldset className="settings-campaign-targets">
                <legend>Nhóm nhận ({selectedGroups.length})</legend>
                {selectableGroups.length === 0 && (
                  <p className="settings-muted">
                    Chưa có nhóm nào vừa được phép vừa đã gán đại lý.
                  </p>
                )}
                {selectableGroups.map((group) => (
                  <label key={group.id} className="settings-checkbox-field">
                    <input
                      type="checkbox"
                      checked={selectedGroups.includes(group.id)}
                      onChange={(event) => {
                        setReviewed(false);
                        setSelectedGroups((current) =>
                          event.target.checked
                            ? [...current, group.id]
                            : current.filter((id) => id !== group.id),
                        );
                      }}
                    />
                    <span>{group.name}</span>
                  </label>
                ))}
              </fieldset>
              <SettingsAdvanced title="Cấu hình nâng cao" hint="Mã mẫu · lịch định kỳ">
                <label className="settings-focus-choice">
                  <span>Mã mẫu nội dung (không bắt buộc)</span>
                  <input
                    value={templateKey}
                    onChange={(event) => setTemplateKey(event.target.value)}
                  />
                </label>
                {kind !== 'one_off' && (
                  <label className="settings-focus-choice">
                    <span>Cấu hình lịch định kỳ</span>
                    <textarea
                      rows={3}
                      value={recurrenceJson}
                      onChange={(event) => setRecurrenceJson(event.target.value)}
                    />
                    <small className="settings-muted">
                      Hệ thống chỉ lưu lại cấu hình này; giai đoạn 1 vẫn chạy từng lần do người lên
                      lịch.
                    </small>
                  </label>
                )}
              </SettingsAdvanced>
            </>
          )}
          {formError && (
            <p className="settings-focus-choice__error" role="alert">
              {formError}
            </p>
          )}
        </SettingsWorkCard>
      ) : selected ? (
        <ManageCampaignCard
          campaign={selected}
          headingRef={workHeading}
          windowStart={windowStart}
          windowEnd={windowEnd}
          setWindowStart={setWindowStart}
          setWindowEnd={setWindowEnd}
          pending={approve.isPending || schedule.isPending || retry.isPending}
          onApprove={() => setApproving(selected)}
          onSchedule={() => schedule.mutate(selected.id)}
          onRetry={() => retry.mutate(selected.id)}
          onCancel={() => setCancelling(selected)}
          onClose={() => setMode({ kind: 'idle' })}
        />
      ) : (
        <SettingsWorkCard
          eyebrow="Việc có thể làm ở đây"
          title="Soạn một chiến dịch mới"
          problem="Hoặc chọn một chiến dịch bên dưới để làm tiếp bước của nó."
          tone="ok"
          headingId="settings-campaign-work"
          headingRef={workHeading}
          actions={
            <SettingsActionRow
              primary={
                <button
                  type="button"
                  ref={rememberTrigger}
                  className="settings-button settings-button--primary"
                  onClick={() => {
                    setReviewed(false);
                    setFormError(undefined);
                    setMode({ kind: 'compose' });
                  }}
                >
                  Soạn chiến dịch
                </button>
              }
            />
          }
        />
      )}

      <SettingsAdvanced
        title="Các chiến dịch đã có"
        hint={`${list.length} chiến dịch`}
        defaultOpen={mode.kind === 'idle'}
      >
        {campaigns.isLoading && (
          <SettingsPanelState title="Đang tải chiến dịch" detail="Đọc kết quả gửi…" />
        )}
        {campaigns.isSuccess && list.length === 0 && (
          <p className="settings-muted">Chưa có chiến dịch nào. Soạn bản nháp đầu tiên ở trên.</p>
        )}
        <ul className="settings-focus-queue">
          {list.map((campaign) => {
            const sent = campaign.deliveries.filter((row) => row.status === 'sent').length;
            const failed = campaign.deliveries.filter((row) => row.status === 'failed').length;
            return (
              <li key={campaign.id}>
                <div>
                  <span
                    className={`settings-version-chip settings-version-chip--${campaign.status}`}
                  >
                    {STATUS_LABELS[campaign.status]}
                  </span>{' '}
                  <strong>{campaign.name}</strong>
                </div>
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  aria-current={selected?.id === campaign.id || undefined}
                  onClick={(event) => {
                    rememberTrigger(event.currentTarget);
                    setMode({ kind: 'manage', campaignId: campaign.id });
                  }}
                >
                  {resolveCampaignAction(campaign.status)?.label ?? 'Xem'}
                </button>
                <small>
                  {KIND_LABELS[campaign.kind]} · {formatSettingsDate(campaign.createdAt)} ·{' '}
                  {campaign.targets.length} nhóm · đã gửi {sent} · lỗi {failed}
                </small>
              </li>
            );
          })}
        </ul>
      </SettingsAdvanced>

      {approving && (
        <SettingsFocusModal
          title={`Duyệt nội dung “${approving.name}”?`}
          description="Duyệt xong mới lên lịch gửi được. Nội dung sẽ không đổi sau khi duyệt."
          confirmLabel="Duyệt nội dung"
          tone="primary"
          pending={approve.isPending}
          onCancel={() => setApproving(null)}
          onConfirm={() => approve.mutate(approving.id)}
        >
          <p className="settings-muted">{approving.content}</p>
        </SettingsFocusModal>
      )}

      {cancelling && (
        <SettingsFocusModal
          title={`Hủy chiến dịch “${cancelling.name}”?`}
          description="Các lần gửi chưa thực hiện sẽ bị hủy."
          confirmLabel="Hủy chiến dịch"
          pending={cancel.isPending}
          onCancel={() => setCancelling(null)}
          onConfirm={() => cancel.mutate(cancelling.id)}
        >
          <ul className="settings-confirmation">
            <li>Tin đã gửi cho khách không thu hồi được.</li>
            <li>Hoàn tác: soạn một chiến dịch mới; chiến dịch đã hủy không chạy lại được.</li>
          </ul>
        </SettingsFocusModal>
      )}
    </div>
  );
}

function ManageCampaignCard({
  campaign,
  headingRef,
  windowStart,
  windowEnd,
  setWindowStart,
  setWindowEnd,
  pending,
  onApprove,
  onSchedule,
  onRetry,
  onCancel,
  onClose,
}: {
  campaign: CampaignView;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  windowStart: string;
  windowEnd: string;
  setWindowStart: (value: string) => void;
  setWindowEnd: (value: string) => void;
  pending: boolean;
  onApprove: () => void;
  onSchedule: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const action = resolveCampaignAction(campaign.status);
  const needsWindow = action?.kind === 'schedule';
  const primary =
    action && action.kind !== 'watch' ? (
      <button
        type="button"
        className="settings-button settings-button--primary"
        disabled={pending || (needsWindow && (!windowStart || !windowEnd))}
        onClick={() => {
          if (action.kind === 'approve') onApprove();
          else if (action.kind === 'schedule') onSchedule();
          else if (action.kind === 'retry') onRetry();
        }}
      >
        {action.label}
      </button>
    ) : undefined;

  return (
    <SettingsWorkCard
      eyebrow="Đang xử lý một chiến dịch"
      title={campaign.name}
      problem={`Trạng thái hiện tại: ${STATUS_LABELS[campaign.status]}.`}
      tone={campaign.status === 'partially_failed' ? 'blocked' : 'attention'}
      headingId="settings-campaign-work"
      headingRef={headingRef}
      actions={
        <SettingsActionRow
          primary={primary}
          secondary={
            <button type="button" className="settings-button settings-button--quiet" onClick={onClose}>
              Đóng
            </button>
          }
          blockedReason={
            needsWindow && (!windowStart || !windowEnd)
              ? 'Nhập cả giờ bắt đầu và giờ kết thúc của cửa sổ gửi trước.'
              : undefined
          }
          tertiary={
            canCancelCampaign(campaign.status) ? (
              <button
                type="button"
                className="settings-text-action settings-text-action--danger"
                onClick={onCancel}
              >
                Hủy chiến dịch
              </button>
            ) : undefined
          }
        />
      }
    >
      <p>{campaign.content}</p>
      {needsWindow && (
        <div className="settings-focus-grid">
          <label className="settings-focus-choice">
            <span>Bắt đầu cửa sổ gửi</span>
            <input
              aria-label="Bắt đầu cửa sổ gửi"
              type="datetime-local"
              value={windowStart}
              onChange={(event) => setWindowStart(event.target.value)}
            />
          </label>
          <label className="settings-focus-choice">
            <span>Kết thúc cửa sổ gửi</span>
            <input
              aria-label="Kết thúc cửa sổ gửi"
              type="datetime-local"
              value={windowEnd}
              onChange={(event) => setWindowEnd(event.target.value)}
            />
          </label>
        </div>
      )}
      <SettingsAdvanced title="Nhóm nhận và kết quả gửi" hint={`${campaign.targets.length} nhóm`}>
        <ul className="settings-focus-readonly">
          {campaign.targets.map((target) => (
            <li key={target.id}>
              <span>{target.displayName ?? target.chatId}</span>
              <code>{target.chatId}</code>
            </li>
          ))}
        </ul>
      </SettingsAdvanced>
    </SettingsWorkCard>
  );
}
