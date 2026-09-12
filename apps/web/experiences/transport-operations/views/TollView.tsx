'use client';

import { useState } from 'react';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useNavigationInput,
  useTollAccountLinks,
  useTollAccounts,
  useTollProviders,
} from '../hooks/useTransportWorkspace';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import {
  toTollAccountRows,
  toTollLinkRows,
  toTollProviderRows,
  tollCapabilities,
  type TollAccountRow,
  type TollLinkRow,
  type TollProviderRow,
} from '../workspace/toll';
import { TollCandidateQueue } from './TollCandidateQueue';

/**
 * Man PHI DUONG BO (ETC).
 *
 * ==============================================================================================
 * DIEU DAU TIEN MAN NAY PHAI NOI LA CAI NO KHONG LAM DUOC
 * ==============================================================================================
 *
 * Do lai 08/09/2026: khong nha cung cap ETC nao o Viet Nam cong bo tai lieu API cho khach hang.
 * Nen bang do san sang duoc dat LEN DAU, truoc moi bang so lieu: neu khong, nguoi van hanh se ngoi
 * cho mot duong tu dong khong ton tai thay vi di xin mot tep mau va nap tay.
 *
 * `NOT_PUBLICLY_PROVEN` KHONG duoc viet thanh "dang ket noi" hay "sap co" — mot cau chu mo ho o
 * day la mot loi hua sai, va no lam nguoi ta cho thay vi lam.
 *
 * ==============================================================================================
 * ETC LA TIEN CONG TY, KHONG BAO GIO LA QUY LAI XE
 * ==============================================================================================
 *
 * Man nay CO Y khong co mot o nao noi ve lai xe, quy lai xe hay luong. Phieu dau la tien lai xe
 * ung truoc; ETC la tien cong ty tra thang cho nha cung cap (`#229` §8). Hai dong tien do khong
 * dung chung mot bang, mot kieu, hay mot man hinh.
 */
export function TollView() {
  const navigation = useNavigationInput();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const providers = toSectionQuery(useTollProviders(navigation));
  const accounts = toSectionQuery(useTollAccounts(navigation));
  const links = toSectionQuery(useTollAccountLinks(navigation, selectedAccountId));

  if (!hasOperationsScope(navigation.role)) {
    return (
      <>
        <PageHeader title="Phí đường bộ (ETC)" />
        <ErrorState message={operationsEmptyMessage(navigation.role)} />
      </>
    );
  }

  const capabilities = tollCapabilities(navigation.role);
  const providerRows = providers.data ? toTollProviderRows(providers.data) : [];
  const accountRows = toTollAccountRows(accounts.data ?? [], links.data ?? []);
  const selectedAccount = (accounts.data ?? []).find((account) => account.id === selectedAccountId);
  const linkRows = toTollLinkRows(
    links.data ?? [],
    () => (selectedAccount ? `${selectedAccount.provider} ${selectedAccount.accountNo}` : '—'),
    (vehicleId) => vehicleId,
  );

  const readyCount = providerRows.filter((row) => row.statementReady).length;

  return (
    <>
      <PageHeader
        title="Phí đường bộ (ETC)"
        summary="Tài khoản VETC/ePass, sổ xe nhận chi trả, và hàng chờ đối soát từng dòng. Đây là chi phí của công ty — không bao giờ trừ vào Quỹ lái xe."
      />

      <div className="tx-metrics">
        <MetricCard
          label="Nhà cung cấp đọc được bảng kê"
          value={`${String(readyCount)}/${String(providerRows.length)}`}
          hint={
            readyCount === providerRows.length
              ? null
              : 'Nhà cung cấp còn lại cần một tệp mẫu để khai bộ cột.'
          }
        />
        <MetricCard label="Tài khoản giao thông" value={String(accountRows.length)} />
      </div>

      {/* Do san sang len DAU — xem khoi chu thich dau tep. */}
      <ProviderReadinessPanel
        rows={providerRows}
        isLoading={providers.isLoading}
        errorMessage={providers.errorMessage}
        onRetry={providers.refetch}
      />

      <AccountsPanel
        rows={accountRows}
        isLoading={accounts.isLoading}
        isBlocked={accounts.isBlocked}
        errorMessage={accounts.errorMessage}
        onRetry={accounts.refetch}
        selectedId={selectedAccountId}
        onSelect={setSelectedAccountId}
        canManage={capabilities.canManageAccounts}
      />

      {selectedAccountId === null ? null : (
        <LinksPanel
          rows={linkRows}
          isLoading={links.isLoading}
          errorMessage={links.errorMessage}
          onRetry={links.refetch}
        />
      )}

      {capabilities.canReadReview ? <TollCandidateQueue navigation={navigation} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Do san sang cua nha cung cap
 * ------------------------------------------------------------------ */

function ProviderReadinessPanel({
  rows,
  isLoading,
  errorMessage,
  onRetry,
}: {
  readonly rows: readonly TollProviderRow[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly onRetry: () => void;
}) {
  return (
    <section className="tx-panel" aria-labelledby="toll-providers-heading">
      <h2 id="toll-providers-heading">Đường vào dữ liệu của từng nhà cung cấp</h2>
      <p className="tx-panel__hint">
        Đo 08/09/2026: không nhà cung cấp nào công bố tài liệu API cho khách hàng. Đường hợp pháp để
        yêu cầu một đường API được ghi ở cột cuối — không có cách đi vòng nào khác.
      </p>

      {isLoading ? <LoadingState label="Đang tải độ sẵn sàng…" /> : null}
      {errorMessage === null ? null : <ErrorState message={errorMessage} onRetry={onRetry} />}

      {rows.length === 0 && !isLoading && errorMessage === null ? (
        <EmptyState title="Chưa khai nhà cung cấp nào." />
      ) : null}

      {rows.length === 0 ? null : (
        <DataTable
          caption="Độ sẵn sàng của từng nhà cung cấp ETC"
          columns={[
            {
              key: 'provider',
              header: 'Nhà cung cấp',
              isRowHeader: true,
              render: (row: TollProviderRow) => row.providerLabel,
            },
            {
              key: 'statement',
              header: 'Nạp bảng kê',
              render: (row: TollProviderRow) => (
                <StatusBadge label={row.statementLabel} tone={row.statementTone} />
              ),
            },
            {
              key: 'blocked',
              header: 'Vì sao chưa nạp được',
              render: (row: TollProviderRow) => row.blockedReasonLabel ?? '—',
            },
            {
              key: 'api',
              header: 'Đường API',
              render: (row: TollProviderRow) => (
                <StatusBadge label={row.apiStatusLabel} tone={row.apiStatusTone} />
              ),
            },
            {
              key: 'request',
              header: 'Đường yêu cầu hợp pháp',
              render: (row: TollProviderRow) => row.requestPathLabel ?? '—',
            },
          ]}
          rows={rows}
          rowKey={(row) => row.provider}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Tai khoan giao thong
 * ------------------------------------------------------------------ */

function AccountsPanel({
  rows,
  isLoading,
  isBlocked,
  errorMessage,
  onRetry,
  selectedId,
  onSelect,
  canManage,
}: {
  readonly rows: readonly TollAccountRow[];
  readonly isLoading: boolean;
  readonly isBlocked: boolean;
  readonly errorMessage: string | null;
  readonly onRetry: () => void;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly canManage: boolean;
}) {
  if (isBlocked) {
    return (
      <section className="tx-panel">
        <h2>Tài khoản giao thông</h2>
        <EmptyState title="Vai của bạn không đọc được tài khoản giao thông." />
      </section>
    );
  }

  return (
    <section className="tx-panel" aria-labelledby="toll-accounts-heading">
      <h2 id="toll-accounts-heading">Tài khoản giao thông</h2>
      <p className="tx-panel__hint">
        Chọn một tài khoản để xem sổ xe nhận chi trả của nó.
        {canManage ? '' : ' Vai của bạn chỉ xem, không sửa được tài khoản.'}
      </p>

      {isLoading ? <LoadingState label="Đang tải tài khoản…" /> : null}
      {errorMessage === null ? null : <ErrorState message={errorMessage} onRetry={onRetry} />}

      {rows.length === 0 && !isLoading && errorMessage === null ? (
        <EmptyState title="Chưa khai tài khoản giao thông nào." />
      ) : (
        <DataTable
          caption="Tài khoản giao thông của công ty"
          columns={[
            {
              key: 'account',
              header: 'Số tài khoản',
              isRowHeader: true,
              render: (row: TollAccountRow) => row.accountNo,
            },
            {
              key: 'provider',
              header: 'Nhà cung cấp',
              render: (row: TollAccountRow) => row.providerLabel,
            },
            {
              key: 'holder',
              header: 'Chủ tài khoản',
              render: (row: TollAccountRow) => row.holderLabel,
            },
            {
              key: 'active',
              header: 'Trạng thái',
              render: (row: TollAccountRow) => (
                <StatusBadge label={row.activeLabel} tone={row.activeTone} />
              ),
            },
            {
              key: 'links',
              header: 'Xe đang nhận chi trả',
              isNumeric: true,
              render: (row: TollAccountRow) => row.effectiveLinkCountLabel,
            },
          ]}
          rows={rows}
          rowKey={(row) => row.id}
          selectedKey={selectedId ?? undefined}
          onSelect={(row) => {
            onSelect(row.id === selectedId ? null : row.id);
          }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * So xe nhan chi tra
 * ------------------------------------------------------------------ */

function LinksPanel({
  rows,
  isLoading,
  errorMessage,
  onRetry,
}: {
  readonly rows: readonly TollLinkRow[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly onRetry: () => void;
}) {
  return (
    <section className="tx-panel" aria-labelledby="toll-links-heading">
      <h2 id="toll-links-heading">Sổ xe nhận chi trả</h2>
      <p className="tx-panel__hint">
        Mỗi dòng là một ĐOẠN THỜI GIAN. Khi một xe đổi tài khoản, đoạn cũ được đóng lại chứ không bị
        xoá — một lượt qua trạm tháng trước vẫn thuộc về tài khoản cũ.
      </p>

      {isLoading ? <LoadingState label="Đang tải sổ xe…" /> : null}
      {errorMessage === null ? null : <ErrorState message={errorMessage} onRetry={onRetry} />}

      {rows.length === 0 && !isLoading && errorMessage === null ? (
        <EmptyState title="Tài khoản này chưa gắn xe nào." />
      ) : (
        <DataTable
          caption="Các đoạn thời gian một xe nhận chi trả từ tài khoản này"
          columns={[
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
                <StatusBadge
                  label={row.effectiveNow ? 'Đang hiệu lực' : 'Đã đóng'}
                  tone={row.effectiveTone}
                />
              ),
            },
            {
              key: 'provenance',
              header: 'Nguồn',
              render: (row: TollLinkRow) => row.provenanceLabel,
            },
            { key: 'created', header: 'Khai lúc', render: (row: TollLinkRow) => row.createdLabel },
          ]}
          rows={rows}
          rowKey={(row) => row.id}
        />
      )}
    </section>
  );
}
