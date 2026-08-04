'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  filterParticipants,
  settingsApi,
  type CustomerRank,
  type GroupParticipant,
  type HandlingMode,
  type OperationalRole,
  type ParticipantBulkRequest,
  type ParticipantFilters,
  type ParticipantPatch,
  type ParticipantSource,
  type SettingsSummary,
} from '../../lib/settings';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

type Props = {
  groups: SettingsSummary['groups'];
};

const RANK_OPTIONS: readonly { value: CustomerRank; label: string }[] = [
  { value: 'unknown', label: 'Chưa phân loại' },
  { value: 'dai_ly', label: 'Đại lý' },
  { value: 'ctv', label: 'CTV' },
  { value: 'khach_le', label: 'Khách lẻ' },
];

const ROLE_OPTIONS: readonly { value: OperationalRole; label: string }[] = [
  { value: 'unknown', label: 'Chưa rõ vai trò' },
  { value: 'khach_hang', label: 'Khách hàng' },
  { value: 'sale', label: 'Sale' },
  { value: 'ke_toan', label: 'Kế toán' },
  { value: 'quan_ly', label: 'Quản lý' },
  { value: 'ksnb', label: 'KSNB' },
  { value: 'bpvh', label: 'BP vận hành' },
  { value: 'ky_thuat', label: 'Kỹ thuật' },
];

const HANDLING_OPTIONS: readonly { value: HandlingMode; label: string }[] = [
  { value: 'inherit_group', label: 'Theo mặc định nhóm' },
  { value: 'process', label: 'Cho AI xử lý' },
  { value: 'manual_review', label: 'Luôn duyệt tay' },
  { value: 'ignore', label: 'Bỏ qua trước AI' },
];

/**
 * Nguon goc cua tung ho so. Quan trong voi nguoi van hanh vi tu 04/08/2026 Zalo khong tra danh
 * sach thanh vien nua — phan lon hang trong bang la nguoi ĐÃ NHẮN, khong phai toan bo nhom.
 */
const SOURCE_LABELS: Readonly<Record<ParticipantSource, string>> = {
  zca_sync: 'Đồng bộ từ Zalo',
  message_stream: 'Học từ tin nhắn',
  manual: 'Người vận hành đặt',
};

const INITIAL_FILTERS: ParticipantFilters = {
  search: '',
  customerRank: 'all',
  operationalRole: 'all',
  handlingMode: 'all',
};

type ParticipantEditorProps = {
  participant: GroupParticipant;
  isPending: boolean;
  onCancel: () => void;
  onSave: (patch: ParticipantPatch) => void;
};

function ParticipantEditor({ participant, isPending, onCancel, onSave }: ParticipantEditorProps) {
  const [draft, setDraft] = useState<Required<ParticipantPatch>>({
    customerRank: participant.customerRank,
    operationalRole: participant.operationalRole,
    handlingMode: participant.handlingMode,
  });

  const handleSave = () => {
    const highImpact = draft.handlingMode === 'ignore';
    if (
      highImpact &&
      !window.confirm(
        'Bỏ qua nghĩa là tin mới của thành viên này sẽ không đi vào AI. Lưu thay đổi?',
      )
    ) {
      return;
    }
    onSave(draft);
  };

  return (
    <div className="settings-inline-editor" aria-label={`Sửa phân loại ${participant.displayName}`}>
      <label>
        <span>Phân loại (rank)</span>
        <select
          value={draft.customerRank}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              customerRank: event.target.value as CustomerRank,
            }))
          }
        >
          {RANK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Vai trò vận hành</span>
        <select
          value={draft.operationalRole}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              operationalRole: event.target.value as OperationalRole,
            }))
          }
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Cách xử lý tin</span>
        <select
          value={draft.handlingMode}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              handlingMode: event.target.value as HandlingMode,
            }))
          }
        >
          {HANDLING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="settings-inline-editor__actions">
        <button type="button" className="settings-button settings-button--quiet" onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className="settings-button settings-button--primary"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? 'Đang lưu…' : 'Lưu phân loại'}
        </button>
      </div>
    </div>
  );
}

export function ParticipantsSettings({ groups }: Props) {
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [filters, setFilters] = useState<ParticipantFilters>(INITIAL_FILTERS);
  const [editingId, setEditingId] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<HandlingMode>('manual_review');
  const effectiveGroupId = selectedGroupId || groups[0]?.id || '';
  const selectedGroup = groups.find((group) => group.id === effectiveGroupId);
  // Loc CO CAU TRUC gui thang len API (endpoint da ho tro san, truoc day bi bo khong).
  // Rieng o tim kiem giu o client de khong ban mot request moi ky tu go.
  const serverFilters: ParticipantFilters = { ...filters, search: '' };

  const participantsQuery = useQuery({
    queryKey: [
      'settings-participants',
      effectiveGroupId,
      filters.customerRank,
      filters.operationalRole,
      filters.handlingMode,
    ],
    queryFn: () => settingsApi.listParticipants(effectiveGroupId, serverFilters),
    enabled: Boolean(effectiveGroupId),
  });
  const visibleParticipants = filterParticipants(
    participantsQuery.data?.participants ?? [],
    filters,
  );

  const [savedNotice, setSavedNotice] = useState<string>();
  const updateMutation = useMutation({
    mutationFn: ({ participantId, patch }: { participantId: string; patch: ParticipantPatch }) =>
      settingsApi.updateParticipant(effectiveGroupId, participantId, patch),
    onSuccess: (participant) => {
      const handling = HANDLING_OPTIONS.find(
        (option) => option.value === participant.handlingMode,
      )?.label;
      const rank = RANK_OPTIONS.find(
        (option) => option.value === participant.customerRank,
      )?.label;
      setSavedNotice(`${participant.displayName} · ${rank} · ${handling}`);
      setEditingId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['settings-participants', effectiveGroupId] });
    },
  });
  const previewMutation = useMutation({
    mutationFn: (request: ParticipantBulkRequest) =>
      settingsApi.previewParticipantBulk(effectiveGroupId, request),
  });
  const bulkMutation = useMutation({
    mutationFn: (request: ParticipantBulkRequest) =>
      settingsApi.bulkUpdateParticipants(effectiveGroupId, request),
    onSuccess: (_list, request) => {
      const handling = HANDLING_OPTIONS.find(
        (option) => option.value === request.patch.handlingMode,
      )?.label;
      setSavedNotice(`${request.participantIds.length} thành viên → ${handling}`);
      setSelectedIds(new Set());
      previewMutation.reset();
      void queryClient.invalidateQueries({ queryKey: ['settings-participants', effectiveGroupId] });
    },
  });

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    previewMutation.reset();
  };

  const buildBulkRequest = (): ParticipantBulkRequest => ({
    participantIds: [...selectedIds],
    patch: { handlingMode: bulkMode },
  });
  if (groups.length === 0) {
    return (
      <SettingsPanelState
        title="Chưa có nhóm để phân loại"
        detail="Cho phép ít nhất một nhóm ở phần Kênh Zalo, sau đó đồng bộ thành viên."
      />
    );
  }

  const actionError = updateMutation.error ?? previewMutation.error ?? bulkMutation.error;

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Phân loại người gửi, không phân giá</p>
          <h2>Nhóm & thành viên</h2>
          <p>Rank định tuyến và tone; đơn giá vẫn lấy theo đại lý đang map với nhóm.</p>
          {/* Zalo khong tra danh sach thanh vien nua -> phai noi ro day la NGUOI DA NHAN, khong
              phai toan bo nhom, keo nguoi van hanh tuong ai vang mat la da roi nhom. */}
          <p>
            Danh sách gồm những người <b>đã nhắn</b> trong nhóm, không phải toàn bộ thành viên —
            Zalo hiện không trả danh sách đầy đủ. Ai chưa nhắn lần nào thì chưa xuất hiện ở đây.
          </p>
        </div>
        <label className="settings-field settings-field--group">
          <span>Nhóm đang xem</span>
          <select
            value={effectiveGroupId}
            onChange={(event) => {
              setSelectedGroupId(event.target.value);
              setSelectedIds(new Set());
              previewMutation.reset();
              setEditingId(undefined);
              setSavedNotice(undefined);
            }}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="settings-mapping-strip">
        <span>Nhóm</span>
        <strong>{selectedGroup?.name}</strong>
        <i aria-hidden="true">→</i>
        <span>Đại lý áp giá</span>
        <strong>{selectedGroup?.dealerName ?? 'Chưa map — cần xử lý'}</strong>
        <small>Rank thành viên không thay đổi liên kết này.</small>
      </div>

      {selectedIds.size > 0 && (
        <div className="settings-bulkbar" role="region" aria-label="Sửa nhiều thành viên">
          <strong>{selectedIds.size} thành viên đã chọn</strong>
          <label>
            <span>Đổi cách xử lý thành</span>
            <select
              value={bulkMode}
              onChange={(event) => {
                setBulkMode(event.target.value as HandlingMode);
                previewMutation.reset();
              }}
            >
              {HANDLING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="settings-button settings-button--primary"
            disabled={previewMutation.isPending || bulkMutation.isPending}
            onClick={() => previewMutation.mutate(buildBulkRequest())}
          >
            {previewMutation.isPending ? 'Đang xem trước…' : 'Xem trước thay đổi'}
          </button>
        </div>
      )}

      {previewMutation.data && (
        <div className="settings-bulk-preview" role="status" aria-live="polite">
          <div>
            <p className="settings-eyebrow">Xác nhận thay đổi hàng loạt</p>
            <strong>
              {previewMutation.data.affectedCount} thành viên sẽ chuyển sang{' '}
              {HANDLING_OPTIONS.find((option) => option.value === bulkMode)?.label}.
            </strong>
            <small>Đại lý, rank và đơn giá không thay đổi.</small>
            {previewMutation.data.warnings.map((warning) => (
              <p key={warning} className="settings-warning-text">
                {warning}
              </p>
            ))}
          </div>
          <div>
            <button
              type="button"
              className="settings-button settings-button--quiet"
              onClick={() => previewMutation.reset()}
            >
              Hủy
            </button>
            <button
              type="button"
              className="settings-button settings-button--primary"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate(buildBulkRequest())}
            >
              {bulkMutation.isPending ? 'Đang áp dụng…' : 'Xác nhận & áp dụng'}
            </button>
          </div>
        </div>
      )}

      <div className="settings-filterbar" aria-label="Bộ lọc thành viên">
        <label className="settings-field settings-field--search">
          <span>Tìm thành viên</span>
          <input
            type="search"
            value={filters.search}
            placeholder="Tên hiển thị hoặc tên Zalo"
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
          />
        </label>
        <FilterSelect
          label="Rank"
          value={filters.customerRank}
          options={RANK_OPTIONS}
          onChange={(value) =>
            setFilters((current) => ({ ...current, customerRank: value as CustomerRank | 'all' }))
          }
        />
        <FilterSelect
          label="Vai trò"
          value={filters.operationalRole}
          options={ROLE_OPTIONS}
          onChange={(value) =>
            setFilters((current) => ({
              ...current,
              operationalRole: value as OperationalRole | 'all',
            }))
          }
        />
        <FilterSelect
          label="Cách xử lý"
          value={filters.handlingMode}
          options={HANDLING_OPTIONS}
          onChange={(value) =>
            setFilters((current) => ({ ...current, handlingMode: value as HandlingMode | 'all' }))
          }
        />
      </div>

      {actionError && (
        <SettingsPanelState
          tone="error"
          title="Chưa lưu được phân loại"
          detail={actionError.message}
        />
      )}
      {savedNotice && !updateMutation.isPending && !bulkMutation.isPending && (
        <SettingsPanelState
          tone="success"
          title="Đã lưu phân loại vào hệ thống"
          detail={`${savedNotice}. Áp dụng cho tin nhắn nhận từ bây giờ; đơn giá vẫn theo đại lý đang map với nhóm.`}
        />
      )}
      {participantsQuery.isLoading && (
        <SettingsPanelState
          title="Đang tải thành viên"
          detail="Đọc danh sách đã đồng bộ từ nguồn dữ liệu nội bộ…"
        />
      )}
      {participantsQuery.error && (
        <SettingsPanelState
          tone="error"
          title="Không tải được thành viên"
          detail={participantsQuery.error.message}
          action={
            <button
              type="button"
              className="settings-button settings-button--quiet"
              onClick={() => participantsQuery.refetch()}
            >
              Thử lại
            </button>
          }
        />
      )}
      {participantsQuery.isSuccess && visibleParticipants.length === 0 && (
        <SettingsPanelState
          title="Không có thành viên phù hợp"
          detail="Đổi bộ lọc hoặc đồng bộ lại thành viên ở phần Kênh Zalo."
        />
      )}

      {visibleParticipants.length > 0 && (
        <div className="settings-member-list" role="list" aria-label="Danh sách thành viên">
          {visibleParticipants.map((participant) => (
            <article key={participant.id} className="settings-member-row" role="listitem">
              <label className="settings-member-check">
                <input
                  type="checkbox"
                  checked={selectedIds.has(participant.id)}
                  onChange={() => toggleSelected(participant.id)}
                />
                <span className="settings-sr-only">Chọn {participant.displayName}</span>
              </label>
              <span className="settings-avatar" aria-hidden="true">
                {participant.displayName.slice(0, 1).toLocaleUpperCase('vi')}
              </span>
              <div className="settings-member-identity">
                <strong>{participant.displayName}</strong>
                <small>{participant.zaloName ?? participant.externalUserId}</small>
                <small>
                  {SOURCE_LABELS[participant.source]} · nhắn gần nhất{' '}
                  {formatSettingsDate(participant.lastSeenAt)}
                </small>
              </div>
              <div className="settings-member-tags">
                <span>
                  {RANK_OPTIONS.find((option) => option.value === participant.customerRank)?.label}
                </span>
                <span>
                  {
                    ROLE_OPTIONS.find((option) => option.value === participant.operationalRole)
                      ?.label
                  }
                </span>
                <span
                  className={`settings-handling settings-handling--${participant.handlingMode}`}
                >
                  {
                    HANDLING_OPTIONS.find((option) => option.value === participant.handlingMode)
                      ?.label
                  }
                </span>
              </div>
              <button
                type="button"
                className="settings-button settings-button--quiet"
                aria-label={`Sửa phân loại ${participant.displayName}`}
                onClick={() => setEditingId(participant.id)}
              >
                Sửa
              </button>
              {editingId === participant.id && (
                <ParticipantEditor
                  participant={participant}
                  isPending={updateMutation.isPending}
                  onCancel={() => setEditingId(undefined)}
                  onSave={(patch) =>
                    updateMutation.mutate({ participantId: participant.id, patch })
                  }
                />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">Tất cả</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
