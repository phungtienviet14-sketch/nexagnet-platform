'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  settingsApi,
  type CampaignKind,
  type CampaignView,
  type JsonObject,
  type SettingsGroupSummary,
} from '../../lib/settings';
import { SettingsPanelState } from './SettingsPanelState';
import { formatSettingsDate } from './settings-format';

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

export function CampaignSettings({ groups }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<CampaignKind>('one_off');
  const [templateKey, setTemplateKey] = useState('');
  const [recurrenceJson, setRecurrenceJson] = useState('{}');
  const [selectedGroups, setSelectedGroups] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
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
      setPreview(false);
      void refresh();
    },
  });
  const approve = useMutation({ mutationFn: settingsApi.approveCampaign, onSuccess: refresh });
  const schedule = useMutation({
    mutationFn: (id: string) =>
      settingsApi.scheduleCampaign(id, {
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
      }),
    onSuccess: refresh,
  });
  const retry = useMutation({ mutationFn: settingsApi.retryFailedCampaign, onSuccess: refresh });
  const cancel = useMutation({ mutationFn: settingsApi.cancelCampaign, onSuccess: refresh });

  const parseRecurrence = (): JsonObject | undefined => {
    if (kind === 'one_off') return undefined;
    try {
      const parsed: unknown = JSON.parse(recurrenceJson);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      return parsed as JsonObject;
    } catch {
      setFormError('Metadata lịch phải là một JSON object hợp lệ.');
      return undefined;
    }
  };

  const prepareDraft = () => {
    if (!name.trim() || !content.trim()) {
      setFormError('Cần nhập tên và nội dung chiến dịch.');
      return undefined;
    }
    if (selectedGroups.length === 0) {
      setFormError('Cần chọn ít nhất một nhóm đã map và được phép gửi.');
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

  const handlePreview = () => {
    if (prepareDraft()) setPreview(true);
  };

  const actionError = create.error ?? approve.error ?? schedule.error ?? retry.error ?? cancel.error;

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Duyệt trước · delivery bền vững</p>
          <h2>Chiến dịch CSKH</h2>
          <p>Tạo nội dung, chọn nhóm, xem trước, duyệt và phân phối trong cửa sổ gửi.</p>
        </div>
      </header>

      <div className="settings-provisional" role="note">
        <strong>Lịch sinh nhật/định kỳ/âm lịch được lưu dưới dạng metadata</strong>
        <p>
          GĐ1 chạy từng occurrence đã được Sale lên lịch. Việc tự sinh occurrence định kỳ chỉ được
          bật khi khách đã nhập nguồn ngày sinh/lịch và duyệt quy tắc; hệ thống không tự đoán.
        </p>
      </div>

      <section className="settings-drawer" aria-labelledby="campaign-create-title">
        <div className="settings-subheading">
          <div><p className="settings-eyebrow">Bản nháp mới</p><h3 id="campaign-create-title">Nội dung và đối tượng</h3></div>
          {policy.data && (
            <small>Tối đa {policy.data.maxTargets} nhóm · {policy.data.rateLimitPerMinute} lần/phút · spacing ≥ {policy.data.minSpacingSeconds}s</small>
          )}
        </div>
        <div className="settings-form-grid">
          <label><span>Tên chiến dịch</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Loại lịch</span><select value={kind} onChange={(event) => setKind(event.target.value as CampaignKind)}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Template key (không bắt buộc)</span><input value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} /></label>
        </div>
        <label><span>Nội dung gửi</span><textarea rows={4} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        {kind !== 'one_off' && (
          <label><span>Metadata lịch (JSON)</span><textarea rows={3} value={recurrenceJson} onChange={(event) => setRecurrenceJson(event.target.value)} /><small>Ví dụ: {`{"timezone":"Asia/Ho_Chi_Minh","rule":"nguồn do Sale nhập"}`}</small></label>
        )}
        <fieldset className="settings-campaign-targets">
          <legend>Nhóm nhận ({selectedGroups.length})</legend>
          {selectableGroups.length === 0 && <p>Chưa có nhóm vừa được allowlist vừa map đại lý.</p>}
          {selectableGroups.map((group) => (
            <label key={group.id} className="settings-checkbox-field">
              <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={(event) => setSelectedGroups((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} />
              <span>{group.name}</span>
            </label>
          ))}
        </fieldset>
        {formError && <p className="settings-form-error" role="alert">{formError}</p>}
        {preview && <div className="settings-preview-result" role="status"><div><p className="settings-eyebrow">Preview</p><h3>{name}</h3></div><div><span><small>Số nhóm</small><strong>{selectedGroups.length}</strong></span><span><small>Loại</small><strong>{KIND_LABELS[kind]}</strong></span><p>{content}</p></div></div>}
        <div className="settings-inline-actions">
          <button type="button" className="settings-button settings-button--quiet" onClick={handlePreview}>Xem trước</button>
          <button type="button" className="settings-button settings-button--primary" disabled={!preview || create.isPending} onClick={() => { const draft = prepareDraft(); if (draft) create.mutate(draft); }}>{create.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
        </div>
      </section>

      <section className="settings-table-section" aria-labelledby="campaign-list-title">
        <div className="settings-subheading"><div><p className="settings-eyebrow">Queue và kết quả</p><h3 id="campaign-list-title">Các chiến dịch</h3></div></div>
        {campaigns.isLoading && <SettingsPanelState title="Đang tải chiến dịch" detail="Đọc delivery ledger…" />}
        {campaigns.isSuccess && campaigns.data.length === 0 && <SettingsPanelState title="Chưa có chiến dịch" detail="Tạo bản nháp đầu tiên ở phía trên." />}
        {campaigns.data?.map((campaign) => {
          const counts = Object.fromEntries(['pending', 'claimed', 'sent', 'failed', 'cancelled'].map((status) => [status, campaign.deliveries.filter((row) => row.status === status).length]));
          return (
            <article key={campaign.id} className="settings-campaign-row">
              <div><strong>{campaign.name}</strong><small>{KIND_LABELS[campaign.kind]} · {formatSettingsDate(campaign.createdAt)}</small><p>{campaign.content}</p></div>
              <div><span className={`settings-version-chip settings-version-chip--${campaign.status}`}>{STATUS_LABELS[campaign.status]}</span><small>{campaign.targets.length} nhóm · sent {counts.sent} · pending {counts.pending} · failed {counts.failed}</small></div>
              {campaign.status === 'draft' && <button type="button" className="settings-button settings-button--primary" onClick={() => window.confirm('Duyệt nội dung chiến dịch này?') && approve.mutate(campaign.id)}>Duyệt nội dung</button>}
              {campaign.status === 'approved' && <div className="settings-campaign-schedule"><input aria-label="Bắt đầu cửa sổ gửi" type="datetime-local" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} /><input aria-label="Kết thúc cửa sổ gửi" type="datetime-local" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} /><button type="button" className="settings-button settings-button--primary" disabled={!windowStart || !windowEnd} onClick={() => schedule.mutate(campaign.id)}>Lên lịch</button></div>}
              {campaign.status === 'partially_failed' && <button type="button" className="settings-button settings-button--quiet" onClick={() => retry.mutate(campaign.id)}>Retry phần lỗi</button>}
              {['draft', 'approved', 'scheduled', 'running'].includes(campaign.status) && <button type="button" className="settings-button settings-button--danger" onClick={() => window.confirm('Hủy các delivery chưa gửi?') && cancel.mutate(campaign.id)}>Hủy</button>}
            </article>
          );
        })}
      </section>
      {actionError && <SettingsPanelState tone="error" title="Thao tác campaign chưa hoàn tất" detail={actionError.message} />}
    </div>
  );
}

