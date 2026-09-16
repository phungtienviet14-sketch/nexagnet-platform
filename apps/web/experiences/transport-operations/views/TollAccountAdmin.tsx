'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CommandPanel, DataTable, DetailRow, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { TOLL_PROVIDER_LABEL, formatInstant } from '../customer-view';
import type { SectionQuery } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import { transportApi, type CreateTollAccountInput } from '../transport-api';
import {
  TOLL_PROVIDERS,
  type TollAccount,
  type TollAccountLinkCount,
  type TollProvider,
  type Vehicle,
} from '../transport-types';
import { toTollAccountRows, type TollAccountRow } from '../workspace/toll';
import {
  EMPTY_TOLL_ACCOUNT_DRAFT,
  toCreateTollAccountInput,
  tollAccountDraftProblem,
  tollAccountToggleCopy,
  type TollAccountDraft,
} from '../workspace/toll-admin';
import { TollAccountLinks } from './TollAccountLinks';
import { TollVehicleHistory } from './TollVehicleHistory';

/**
 * TAI KHOAN GIAO THONG va SO XE NHAN CHI TRA — `#314` G7.
 *
 * Truoc lane nay `createAccount`/`setAccountActive`/`openLink`/`closeLink` co trong `transport-api.ts`
 * nhung KHONG mot caller nao trong `apps/web`: so xe nhan chi tra — thu mang tinh phap ly — khong bao
 * tri duoc tu san pham. Man nay dong khoang do bang dung bon duong da co cua may chu, khong them mot
 * duong ghi nao.
 *
 * Vai chi doc (`transport.toll.account.read` ma khong co `.manage`) van thay ca bang va so xe; chi cac
 * bieu nhap va nut ghi la an — va man hinh noi vi sao.
 */
export function TollAccountAdmin({
  navigation,
  accounts,
  linkCounts,
  vehicles,
  canManage,
}: {
  readonly navigation: NavigationInput;
  readonly accounts: SectionQuery<readonly TollAccount[]>;
  readonly linkCounts: SectionQuery<readonly TollAccountLinkCount[]>;
  readonly vehicles: readonly Vehicle[] | undefined;
  readonly canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<TollAccount | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (input: { readonly id: string; readonly active: boolean }) =>
      transportApi.toll.setAccountActive(input.id, input.active),
    onSuccess: (account) => {
      setToggling(null);
      setStatus(
        `${account.active ? 'Đã dùng lại' : 'Đã ngừng dùng'} tài khoản ${TOLL_PROVIDER_LABEL[account.provider]} ${account.accountNo}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });
    },
    onError: () => setToggling(null),
  });

  // `linkCounts.data ?? []` chu khong dem tu doan noi: chua doc duoc so dem thi cot do hien `—`.
  const rows = toTollAccountRows(accounts.data ?? [], linkCounts.data ?? []);
  const selected = (accounts.data ?? []).find((account) => account.id === selectedId);
  const toggleCopy = toggling === null ? null : tollAccountToggleCopy(toggling);

  return (
    <>
      {canManage ? (
        <CreateTollAccountCommand
          onCreated={(account) => {
            setStatus(
              `Đã khai tài khoản ${TOLL_PROVIDER_LABEL[account.provider]} ${account.accountNo}. Chọn nó trong bảng để nối xe.`,
            );
            setSelectedId(account.id);
          }}
        />
      ) : null}

      {status === null ? null : (
        <p className="tx-note" role="status">
          {status}
        </p>
      )}

      <section className="tx-panel" aria-labelledby="toll-accounts-heading">
        <h2 id="toll-accounts-heading">Tài khoản giao thông</h2>
        <p className="tx-panel__lead">
          Chọn một tài khoản để xem và bảo trì sổ xe nhận chi trả của nó.
          {canManage ? '' : ' Vai của bạn chỉ xem, không sửa được tài khoản.'}
        </p>

        {accounts.isBlocked ? (
          <EmptyState title="Vai của bạn không đọc được tài khoản giao thông." />
        ) : null}
        {accounts.isLoading ? <LoadingState label="Đang tải tài khoản…" /> : null}
        {accounts.errorMessage === null ? null : (
          <ErrorState message={accounts.errorMessage} onRetry={accounts.refetch} />
        )}
        {accounts.data !== undefined && rows.length === 0 ? (
          <EmptyState
            title="Chưa khai tài khoản giao thông nào."
            nextAction={canManage ? 'Mở biểu khai tài khoản ở trên để bắt đầu.' : undefined}
          />
        ) : null}
        {rows.length === 0 ? null : (
          <DataTable<TollAccountRow>
            caption="Tài khoản giao thông của công ty"
            columns={[
              {
                key: 'account',
                header: 'Số tài khoản',
                isRowHeader: true,
                render: (row) => row.accountNo,
              },
              { key: 'provider', header: 'Nhà cung cấp', render: (row) => row.providerLabel },
              { key: 'holder', header: 'Chủ tài khoản', render: (row) => row.holderLabel },
              {
                key: 'active',
                header: 'Trạng thái',
                render: (row) => <StatusBadge label={row.activeLabel} tone={row.activeTone} />,
              },
              {
                key: 'links',
                header: 'Xe đang nhận chi trả',
                isNumeric: true,
                render: (row) => row.effectiveLinkCountLabel ?? '—',
              },
              {
                key: 'open',
                header: 'Sổ xe',
                render: (row) => (
                  <button
                    type="button"
                    className="tx-btn tx-btn--small"
                    aria-pressed={row.id === selectedId}
                    aria-label={`Xem sổ xe của tài khoản ${row.providerLabel} ${row.accountNo}`}
                    onClick={() => {
                      setStatus(null);
                      setSelectedId(row.id === selectedId ? null : row.id);
                    }}
                  >
                    {row.id === selectedId ? 'Đang xem' : 'Xem sổ xe'}
                  </button>
                ),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            selectedKey={selectedId}
          />
        )}
      </section>

      {selected === undefined ? null : (
        <section className="tx-panel" aria-labelledby="toll-account-detail-heading">
          <div className="tx-detail__head">
            <h2 id="toll-account-detail-heading">
              {TOLL_PROVIDER_LABEL[selected.provider]} {selected.accountNo}
            </h2>
            <StatusBadge
              label={selected.active ? 'Đang dùng' : 'Đã ngừng'}
              tone={selected.active ? 'go' : 'flat'}
            />
          </div>
          <dl className="tx-detail__grid">
            <DetailRow label="Chủ tài khoản">{selected.holderName ?? '—'}</DetailRow>
            <DetailRow label="Khai lúc">{formatInstant(selected.createdAt)}</DetailRow>
          </dl>

          {canManage ? (
            <div className="tx-detail__actions">
              <button
                type="button"
                className={selected.active ? 'tx-btn tx-btn--stop' : 'tx-btn'}
                onClick={() => {
                  toggle.reset();
                  setToggling(selected);
                }}
              >
                {selected.active ? 'Ngừng dùng tài khoản' : 'Dùng lại tài khoản'}
              </button>
            </div>
          ) : null}
          {toggle.error === null ? null : <ErrorState message={toggle.error.message} />}

          <TollAccountLinks
            key={selected.id}
            navigation={navigation}
            account={selected}
            accounts={accounts.data}
            vehicles={vehicles}
            canManage={canManage}
          />
        </section>
      )}

      <ConfirmAction
        open={toggleCopy !== null}
        title={toggleCopy?.title ?? ''}
        detail={toggleCopy?.detail ?? null}
        confirmLabel={toggleCopy?.confirmLabel ?? ''}
        isDestructive={toggling?.active === true}
        isBusy={toggle.isPending}
        onCancel={() => setToggling(null)}
        onConfirm={() => {
          if (toggling !== null) toggle.mutate({ id: toggling.id, active: !toggling.active });
        }}
      />

      <TollVehicleHistory navigation={navigation} vehicles={vehicles} accounts={accounts.data} />
    </>
  );
}

/**
 * KHAI MOT TAI KHOAN — mot ban ghi o day KHONG BAO GIO sinh tu dong tu mot bang ke: so tai khoan doc
 * sai mot chu se lang le tao ra mot tai khoan khong ai biet. Nen chi duong nay tao duoc tai khoan.
 */
function CreateTollAccountCommand({
  onCreated,
}: {
  readonly onCreated: (account: TollAccount) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TollAccountDraft>(EMPTY_TOLL_ACCOUNT_DRAFT);

  const create = useMutation({
    mutationFn: (input: CreateTollAccountInput) => transportApi.toll.createAccount(input),
    onSuccess: (account) => {
      setDraft(EMPTY_TOLL_ACCOUNT_DRAFT);
      onCreated(account);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });
    },
  });

  const problem = tollAccountDraftProblem(draft);

  return (
    <CommandPanel
      title="Khai tài khoản giao thông"
      // Nut gui ten "Khai tài khoản", nen nut mo phai mang ten KHAC — cung ly do voi `StatementImport`.
      openLabel="Mở biểu khai tài khoản"
      hint="Khai số tài khoản VETC/ePass mà nhà cung cấp đã cấp cho công ty. Hệ thống không bao giờ tự tạo tài khoản từ một bảng kê."
    >
      <form
        aria-label="Khai tài khoản giao thông"
        onSubmit={(event) => {
          event.preventDefault();
          if (problem === null) create.mutate(toCreateTollAccountInput(draft));
        }}
      >
        <div className="tx-inlineform">
          <label className="tx-field">
            <span>Nhà cung cấp</span>
            <select
              aria-label="Nhà cung cấp của tài khoản"
              value={draft.provider}
              onChange={(event) =>
                setDraft({ ...draft, provider: event.target.value as TollProvider })
              }
            >
              {TOLL_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {TOLL_PROVIDER_LABEL[provider]}
                </option>
              ))}
            </select>
          </label>
          <label className="tx-field">
            <span>Số tài khoản</span>
            <input
              value={draft.accountNo}
              onChange={(event) => setDraft({ ...draft, accountNo: event.target.value })}
            />
          </label>
          <label className="tx-field">
            <span>Chủ tài khoản (nếu có)</span>
            <input
              value={draft.holderName}
              onChange={(event) => setDraft({ ...draft, holderName: event.target.value })}
            />
          </label>
          <button
            type="submit"
            className="tx-btn tx-btn--go"
            disabled={problem !== null || create.isPending}
          >
            {create.isPending ? 'Đang gửi…' : 'Khai tài khoản'}
          </button>
        </div>
        {problem === null || draft.accountNo === '' ? null : (
          <p className="tx-field__hint">{problem}</p>
        )}
        {create.error === null ? null : <ErrorState message={create.error.message} />}
      </form>
    </CommandPanel>
  );
}
