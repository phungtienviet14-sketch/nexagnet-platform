'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import type { AuthRole } from '../../../lib/auth';
import { ConfirmAction } from '../components/SectionState';
import {
  actionRows,
  changeRole,
  DIRECTOR_CONFIRMATION_PHRASE,
  draftEffective,
  escalatedAllows,
  groupCheckState,
  isDirectorConfirmed,
  permissionLabelLookup,
  presetsOf,
  presetLabelOf,
  roleAcceptsGrants,
  sameAccess,
  setAction,
  toggleGroup,
  transportGroupsOf,
  type AccessDraft,
} from './accounts-model';
import { accountsApi } from './admin-api';
import { violationMessage, violationsOf } from './admin-reasons';
import type { AccessBreakdown, AccountView, CatalogGroup, PermissionCatalog } from './admin-types';
import { AdminError, TriStateCheckbox } from './AdminBits';

/**
 * TRINH CHINH QUYEN (`#395`). Ba tang, tu tho toi min:
 *
 *   1. VAI KHOI DIEM — bon the; Giam doc phai GO cau xac nhan (toan quyen khong la mot lan bam);
 *   2. NHOM VIEC — o ba trang thai (`aria-checked="mixed"`) cho moi nhom cap duoc;
 *   3. TUNG VIEC — mo nhom ra, bat/tat tung dong; dong chi-Giam-doc KHOA, dong nhay cam hoi xac nhan.
 *
 * MOI thay doi goi may chu XEM TRUOC (`dryRun`): cau "Người này sẽ làm được gì?" va moi vi pham tach
 * nhiem la cua MAY CHU, khong phai man hinh tu doan. Man hinh chi giu mot bo quyen TOI GIAN.
 */

const PREVIEW_DELAY_MS = 350;
const EDITABLE_ROLES: readonly AuthRole[] = ['MANAGER', 'ACCOUNTING', 'SALE', 'ADMIN'];

const ROLE_HINT: Readonly<Record<AuthRole, string>> = {
  ADMIN: 'Giám đốc đã có toàn quyền vận hành và quản trị tài khoản — không chỉnh từng nhóm.',
  SALE: 'Lái xe làm việc của chính mình qua hồ sơ lái xe — không cấp thêm nhóm việc.',
  MANAGER: 'Bắt đầu trống: bật đúng những nhóm việc người này cần.',
  ACCOUNTING: 'Bắt đầu từ bộ quyền Kế toán: tắt bớt hoặc bật thêm từng nhóm.',
};

export function GroupEditor({
  group,
  draft,
  isOpen,
  onToggleOpen,
  onToggleGroup,
  onToggleAction,
}: {
  readonly group: CatalogGroup;
  readonly draft: AccessDraft;
  readonly isOpen: boolean;
  readonly onToggleOpen: () => void;
  readonly onToggleGroup: () => void;
  readonly onToggleAction: (code: string, isOn: boolean, needsConfirmation: boolean) => void;
}) {
  const summaryId = useId();
  const listId = useId();
  const effective = draftEffective(draft);
  const acceptsGrants = roleAcceptsGrants(draft.role);
  const state = acceptsGrants ? groupCheckState(group, effective) : 'locked';
  const rows = actionRows(group, draft);
  const held = rows.filter((row) => row.isOn).length;
  const isDirectorOnly = group.actions.every((action) => action.directorOnly);

  return (
    <li className="tx-admin-group" data-state={state}>
      <div className="tx-admin-group__head">
        <TriStateCheckbox
          state={state}
          label={`Nhóm ${group.label}`}
          describedBy={summaryId}
          onToggle={onToggleGroup}
        />
        <div className="tx-admin-group__text">
          <strong>{group.label}</strong>
          <span id={summaryId}>
            {isDirectorOnly ? 'Chỉ Giám đốc — ' : ''}
            {group.summary}
          </span>
        </div>
        <span className="tx-admin-group__count" aria-label={`${held} trên ${rows.length} việc`}>
          {held}/{rows.length}
        </span>
        <button
          type="button"
          className="tx-btn tx-btn--ghost tx-btn--small"
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={onToggleOpen}
        >
          {isOpen ? 'Thu gọn' : 'Từng việc'}
          <span className="tx-visually-hidden"> của nhóm {group.label}</span>
        </button>
      </div>
      <ul className="tx-admin-actionlist" id={listId} hidden={!isOpen}>
        {rows.map((row) => (
          <li key={row.code} className="tx-admin-action" data-origin={row.origin}>
            <label>
              <input
                type="checkbox"
                checked={row.isOn}
                disabled={row.lockedReason !== null}
                onChange={(event) =>
                  onToggleAction(row.code, event.target.checked, row.needsConfirmation)
                }
              />
              <span className="tx-admin-action__label">{row.label}</span>
            </label>
            <span className="tx-admin-kind" data-kind={row.kind}>
              {row.kindLabel}
            </span>
            {row.lockedReason === null ? null : (
              <span className="tx-admin-action__lock">{row.lockedReason}</span>
            )}
            {row.origin === 'GRANTED' ? (
              <span className="tx-admin-action__origin">Cấp thêm</span>
            ) : null}
            {row.origin === 'DENIED' ? (
              <span className="tx-admin-action__origin">Đã bớt</span>
            ) : null}
            {row.sodLabel === null ? null : (
              <small className="tx-admin-action__sod">{row.sodLabel}</small>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function PermissionEditor({
  account,
  catalog,
  onSaved,
  onCancel,
}: {
  readonly account: AccountView;
  readonly catalog: PermissionCatalog;
  readonly onSaved: (access: AccessBreakdown | null) => void;
  readonly onCancel: () => void;
}) {
  const initial: AccessDraft = useMemo(
    () => ({ role: account.role, grants: account.permissionGrants ?? [] }),
    [account.role, account.permissionGrants],
  );
  const [draft, setDraft] = useState<AccessDraft>(initial);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<{ code: string; label: string } | null>(null);
  const [preview, setPreview] = useState<AccessBreakdown | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const groups = transportGroupsOf(catalog).filter((group) => group.grantable);
  const presets = presetsOf(catalog);
  const labelOf = useMemo(() => permissionLabelLookup(catalog), [catalog]);
  const isChanged = !sameAccess(draft, initial);
  const needsDirectorPhrase = draft.role === 'ADMIN' && account.role !== 'ADMIN';
  const escalated = escalatedAllows(draft, groups);

  /* XEM TRUOC moi thay doi — tre mot nhip de mot chuoi bam o khong ban mot chuoi yeu cau. */
  useEffect(() => {
    if (!isChanged) {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    let isCurrent = true;
    const timer = window.setTimeout(() => {
      accountsApi
        .previewAccess(account.id, { ...draft, confirmEscalation: true })
        .then((result) => {
          if (!isCurrent) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (!isCurrent) return;
          setPreview(null);
          setPreviewError(error);
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [account.id, draft, isChanged]);

  const save = useMutation({
    mutationFn: () =>
      accountsApi.saveAccess(account.id, {
        role: draft.role,
        grants: draft.grants,
        confirmEscalation: escalated.length > 0 || needsDirectorPhrase,
      }),
    onSuccess: (result) => onSaved(result.access ?? null),
  });

  const toggleOpen = (id: string) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onToggleAction = (code: string, isOn: boolean, needsConfirmation: boolean) => {
    if (isOn && needsConfirmation) {
      setPending({ code, label: labelOf(code) ?? code });
      return;
    }
    setDraft((current) => setAction(current, code, isOn));
  };

  const violations = violationsOf(previewError).concat(violationsOf(save.error));
  const canSave =
    isChanged &&
    !save.isPending &&
    (!needsDirectorPhrase || isDirectorConfirmed(typedConfirmation));

  return (
    <section className="tx-admin-editor" aria-label={`Chỉnh quyền của ${account.name}`}>
      <fieldset className="tx-admin-presets">
        <legend>Vai khởi điểm</legend>
        {EDITABLE_ROLES.map((role) => {
          const summary =
            presets.find((preset) => preset.role === role)?.summary ?? ROLE_HINT[role];
          return (
            <label
              key={role}
              className="tx-admin-preset"
              data-checked={draft.role === role ? '' : undefined}
            >
              <input
                type="radio"
                name={`preset-${account.id}`}
                value={role}
                checked={draft.role === role}
                onChange={() => {
                  setDraft(role === initial.role ? initial : changeRole(role));
                  setTypedConfirmation('');
                }}
              />
              <strong>{presetLabelOf(role, presets)}</strong>
              <span>{summary}</span>
            </label>
          );
        })}
      </fieldset>

      {needsDirectorPhrase ? (
        <label className="tx-field tx-admin-typed">
          <span>
            Giám đốc có toàn quyền, kể cả cấp và thu hồi quyền của người khác. Gõ đúng câu “
            {DIRECTOR_CONFIRMATION_PHRASE}” để tiếp tục.
          </span>
          <input
            value={typedConfirmation}
            onChange={(event) => setTypedConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
      ) : null}

      <p className="tx-panel__lead">{ROLE_HINT[draft.role]}</p>
      <ul className="tx-admin-groups" aria-label="Nhóm việc">
        {groups.map((group) => (
          <GroupEditor
            key={group.id}
            group={group}
            draft={draft}
            isOpen={openGroups.has(group.id)}
            onToggleOpen={() => toggleOpen(group.id)}
            onToggleGroup={() => setDraft((current) => toggleGroup(current, group))}
            onToggleAction={onToggleAction}
          />
        ))}
      </ul>

      <aside className="tx-admin-preview" aria-live="polite" aria-label="Xem trước">
        <h3>Sau khi lưu, người này làm được gì?</h3>
        {!isChanged ? (
          <p className="tx-note">Chưa có thay đổi.</p>
        ) : preview !== null ? (
          <ul className="tx-admin-sentences">
            {preview.sentences.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        ) : previewError === null ? (
          <p className="tx-note">Đang hỏi máy chủ…</p>
        ) : null}
        {violations.length > 0 ? (
          <ul className="tx-admin-violations" role="alert">
            {violations.map((violation, index) => (
              <li key={`${violation.code}-${violation.permission ?? index}`}>
                {violationMessage(violation, labelOf)}
              </li>
            ))}
          </ul>
        ) : null}
        {previewError !== null && violationsOf(previewError).length === 0 ? (
          <AdminError error={previewError} labelOf={labelOf} />
        ) : null}
        {escalated.length > 0 ? (
          <p className="tx-note tx-note--warn">
            Có {escalated.length} quyền nhạy cảm được cấp thêm — lần lưu này ghi tên bạn vào nhật ký
            cấp quyền.
          </p>
        ) : null}
      </aside>

      {save.error !== null && violationsOf(save.error).length === 0 ? (
        <AdminError error={save.error} labelOf={labelOf} />
      ) : null}
      <div className="tx-admin-actions">
        <button
          type="button"
          className="tx-btn tx-btn--go"
          disabled={!canSave}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu quyền'}
        </button>
        <button type="button" className="tx-btn tx-btn--ghost" onClick={onCancel}>
          Huỷ
        </button>
        {needsDirectorPhrase && !isDirectorConfirmed(typedConfirmation) ? (
          <span className="tx-admin-actions__status">Cần gõ câu xác nhận trước khi lưu.</span>
        ) : null}
      </div>

      <ConfirmAction
        open={pending !== null}
        title={`Cấp quyền nhạy cảm: ${pending?.label ?? ''}?`}
        detail="Vai này bình thường không có quyền này vì lý do kiểm soát (người duyệt tiền không sửa căn cứ, không xem đường đi từng phút của người khác). Lần cấp được ghi vào nhật ký với tên bạn."
        confirmLabel="Tôi hiểu, cấp quyền"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) setDraft((current) => setAction(current, pending.code, true));
          setPending(null);
        }}
      />
    </section>
  );
}
