'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { TOLL_PROVIDER_LABEL, formatBusinessDate } from '../customer-view';
import { toSectionQuery, useTollAccountLinks } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import { transportApi, type OpenTollLinkInput } from '../transport-api';
import type { TollAccount, Vehicle } from '../transport-types';
import { toTollLinkRows, type TollLinkRow } from '../workspace/toll';
import {
  EMPTY_TOLL_LINK_DRAFT,
  toOpenTollLinkInput,
  toTollVehicleOptions,
  tollCloseLinkProblem,
  tollLinkDraftProblem,
  tollOpenLinkBlockedReason,
  tollVehicleLabelOf,
  type TollLinkDraft,
} from '../workspace/toll-admin';
import { VehicleLinkHistoryTable } from './TollVehicleHistory';

/**
 * SO XE NHAN CHI TRA cua MOT tai khoan — doc, NOI xe, DONG doan. `#314` G7.
 *
 * ==============================================================================================
 * KHONG CO NUT XOA, VA "DOI TAI KHOAN" LA HAI BUOC
 * ==============================================================================================
 *
 * May chu khong mo `DELETE`: mot luot qua tram thang truoc thuoc ve tai khoan CU, va xoa doan cu se
 * viet lai lich su do. Xe doi tai khoan = DONG doan o tai khoan cu, roi NOI xe o tai khoan moi. Neu
 * nguoi dung noi truoc khi dong, may chu tu choi (`TOLL_VEHICLE_ALREADY_LINKED`) — man hinh hien
 * nguyen van cau do, va ngay trong bieu noi xe da co lich su cua chinh chiec xe dang chon.
 */
export function TollAccountLinks({
  navigation,
  account,
  accounts,
  vehicles,
  canManage,
}: {
  readonly navigation: NavigationInput;
  readonly account: TollAccount;
  readonly accounts: readonly TollAccount[] | undefined;
  readonly vehicles: readonly Vehicle[] | undefined;
  readonly canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const links = toSectionQuery(useTollAccountLinks(navigation, account.id));
  const [closing, setClosing] = useState<{
    readonly linkId: string;
    readonly effectiveTo: string;
  } | null>(null);
  const [draft, setDraft] = useState<TollLinkDraft>(EMPTY_TOLL_LINK_DRAFT);
  const [status, setStatus] = useState<string | null>(null);

  const vehicleLabelOf = tollVehicleLabelOf(vehicles);
  const accountLabel = `${TOLL_PROVIDER_LABEL[account.provider]} ${account.accountNo}`;
  // Mot lan noi / dong doi CA so doan noi, so dem va lich su theo xe — lam moi ca nhanh `toll`.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });

  const closeLink = useMutation({
    mutationFn: (input: { readonly linkId: string; readonly effectiveTo: string }) =>
      transportApi.toll.closeLink(input.linkId, input.effectiveTo),
    onSuccess: (link) => {
      setClosing(null);
      setStatus(
        `Đã đóng đoạn của xe ${vehicleLabelOf(link.vehicleId)} đến hết ngày ${formatBusinessDate(link.effectiveTo)}. Đoạn cũ vẫn còn trong sổ.`,
      );
      refresh();
    },
  });

  const openLink = useMutation({
    mutationFn: (input: OpenTollLinkInput) => transportApi.toll.openLink(account.id, input),
    onSuccess: (link) => {
      setDraft(EMPTY_TOLL_LINK_DRAFT);
      setStatus(
        `Đã nối xe ${vehicleLabelOf(link.vehicleId)} vào tài khoản ${accountLabel} từ ngày ${formatBusinessDate(link.effectiveFrom)}.`,
      );
      refresh();
    },
  });

  const rows = toTollLinkRows(links.data ?? null, () => accountLabel, vehicleLabelOf);
  const rawById = new Map((links.data?.links ?? []).map((link) => [link.id, link]));
  const closingLink = closing === null ? undefined : rawById.get(closing.linkId);
  const closeProblem =
    closing === null || closingLink === undefined
      ? null
      : tollCloseLinkProblem(closingLink, closing.effectiveTo);
  const openBlocked = tollOpenLinkBlockedReason(account, canManage);
  const draftProblem = tollLinkDraftProblem(draft);
  const vehicleOptions = toTollVehicleOptions(vehicles);

  const columns = [
    {
      key: 'vehicle',
      header: 'Xe',
      isRowHeader: true,
      render: (row: TollLinkRow) => row.vehicleLabel,
    },
    {
      key: 'ref',
      header: 'Mã xe bên nhà cung cấp',
      render: (row: TollLinkRow) => row.providerVehicleRefLabel,
    },
    { key: 'period', header: 'Hiệu lực', render: (row: TollLinkRow) => row.periodLabel },
    {
      key: 'state',
      header: 'Tình trạng',
      render: (row: TollLinkRow) => (
        <StatusBadge label={row.effectiveLabel} tone={row.effectiveTone} />
      ),
    },
    { key: 'provenance', header: 'Nguồn', render: (row: TollLinkRow) => row.provenanceLabel },
    { key: 'created', header: 'Khai lúc', render: (row: TollLinkRow) => row.createdLabel },
    {
      key: 'actions',
      header: 'Việc',
      render: (row: TollLinkRow) =>
        canManage && rawById.get(row.id)?.effectiveTo === null ? (
          <button
            type="button"
            className="tx-btn tx-btn--small"
            aria-label={`Đóng đoạn của xe ${row.vehicleLabel}`}
            onClick={() => {
              setStatus(null);
              closeLink.reset();
              setClosing({ linkId: row.id, effectiveTo: '' });
            }}
          >
            Đóng đoạn
          </button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="tx-detail__block">
      <h3>Sổ xe nhận chi trả</h3>
      <p className="tx-panel__lead">
        Mỗi dòng là một ĐOẠN THỜI GIAN. Khi một xe đổi tài khoản, đoạn cũ được đóng lại chứ không bị
        xoá — một lượt qua trạm tháng trước vẫn thuộc về tài khoản cũ.
      </p>

      {status === null ? null : (
        <p className="tx-note" role="status">
          {status}
        </p>
      )}
      {links.isLoading ? <LoadingState label="Đang tải sổ xe…" /> : null}
      {links.errorMessage === null ? null : (
        <ErrorState message={links.errorMessage} onRetry={links.refetch} />
      )}
      {links.data !== undefined && rows.length === 0 ? (
        <EmptyState title="Tài khoản này chưa nối xe nào." />
      ) : null}
      {rows.length === 0 ? null : (
        <>
          {links.data === undefined ? null : (
            <p className="tx-note">
              Tình trạng tính theo ngày {formatBusinessDate(links.data.onDate)} của hệ thống.
            </p>
          )}
          <DataTable
            caption={`Các đoạn thời gian một xe nhận chi trả từ tài khoản ${accountLabel}`}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
        </>
      )}

      {closing === null || closingLink === undefined ? null : (
        <form
          className="tx-panel tx-panel--form"
          aria-label="Đóng đoạn nối xe"
          onSubmit={(event) => {
            event.preventDefault();
            if (closeProblem === null) closeLink.mutate(closing);
          }}
        >
          <h3>Đóng đoạn của xe {vehicleLabelOf(closingLink.vehicleId)}</h3>
          <p className="tx-panel__lead">
            Ngày kết thúc là ngày CUỐI CÙNG xe còn nhận chi trả từ tài khoản này — cả hai đầu đều
            được tính. Đoạn cũ vẫn nằm trong sổ. Các dòng đã nạp giữ nguyên; các dòng nạp sau có
            ngày sau ngày kết thúc sẽ không còn được đọc về xe này qua tài khoản này.
          </p>
          <div className="tx-inlineform">
            <label className="tx-field">
              <span>Ngày kết thúc</span>
              <input
                type="date"
                required
                min={closingLink.effectiveFrom}
                value={closing.effectiveTo}
                onChange={(event) =>
                  setClosing({ linkId: closing.linkId, effectiveTo: event.target.value })
                }
              />
            </label>
          </div>
          {closeProblem === null ? null : <p className="tx-field__hint">{closeProblem}</p>}
          {closeLink.error === null ? null : <ErrorState message={closeLink.error.message} />}
          <div className="tx-confirm__actions">
            <button type="button" className="tx-btn" onClick={() => setClosing(null)}>
              Quay lại
            </button>
            <button
              type="submit"
              className="tx-btn tx-btn--go"
              disabled={closeProblem !== null || closeLink.isPending}
            >
              {closeLink.isPending ? 'Đang gửi…' : 'Đóng đoạn'}
            </button>
          </div>
        </form>
      )}

      {!canManage ? null : openBlocked !== null ? (
        <p className="tx-note tx-note--warn">{openBlocked}</p>
      ) : (
        <form
          className="tx-panel tx-panel--form"
          aria-label="Nối xe vào tài khoản"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftProblem === null) openLink.mutate(toOpenTollLinkInput(draft));
          }}
        >
          <h3>Nối xe vào tài khoản {accountLabel}</h3>
          <p className="tx-panel__lead">
            Chọn đúng chiếc xe nhận chi trả từ tài khoản này — hệ thống không chọn giúp. Nếu trong
            cùng khoảng ngày xe đang nhận chi trả từ một tài khoản khác, hệ thống sẽ từ chối: đóng
            đoạn cũ trước.
          </p>
          <div className="tx-inlineform">
            <label className="tx-field">
              <span>Xe</span>
              <select
                aria-label="Xe nối vào tài khoản"
                value={draft.vehicleId}
                onChange={(event) => setDraft({ ...draft, vehicleId: event.target.value })}
              >
                <option value="">— Chọn xe —</option>
                {vehicleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tx-field">
              <span>Mã xe bên nhà cung cấp (nếu có)</span>
              <input
                value={draft.providerVehicleRef}
                onChange={(event) => setDraft({ ...draft, providerVehicleRef: event.target.value })}
              />
            </label>
            <label className="tx-field">
              <span>Hiệu lực từ ngày</span>
              <input
                type="date"
                value={draft.effectiveFrom}
                onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })}
              />
            </label>
            <label className="tx-field">
              <span>Đến ngày (để trống nếu vẫn đang dùng)</span>
              <input
                type="date"
                value={draft.effectiveTo}
                onChange={(event) => setDraft({ ...draft, effectiveTo: event.target.value })}
              />
            </label>
          </div>
          {draftProblem === null ? null : <p className="tx-note">{draftProblem}</p>}
          {openLink.error === null ? null : <ErrorState message={openLink.error.message} />}

          {draft.vehicleId === '' ? null : (
            <div className="tx-detail__block">
              <h4>Xe đã chọn hiện nhận chi trả từ</h4>
              <VehicleLinkHistoryTable
                navigation={navigation}
                vehicleId={draft.vehicleId}
                vehicles={vehicles}
                accounts={accounts}
                caption="Các đoạn nhận chi trả hiện có của xe đã chọn"
              />
            </div>
          )}

          <div className="tx-detail__actions">
            <button
              type="submit"
              className="tx-btn tx-btn--go"
              disabled={draftProblem !== null || openLink.isPending}
            >
              {openLink.isPending ? 'Đang gửi…' : 'Nối xe'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
