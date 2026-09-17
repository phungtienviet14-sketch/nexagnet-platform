'use client';

import { DetailRow, StatusBadge } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useTollCandidateDetail,
  useTollDuplicatePeers,
} from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import { toTollCandidateRow } from '../workspace/toll';
import { toTollDecisionTimeline } from '../workspace/toll-duplicates';
import { TollDuplicateReview } from './TollDuplicateReview';

/**
 * MOT DONG ETC kem LICH SU quyet dinh — `#314` G8/G9.
 *
 * Nguoi doi soat phai thay AI da lam gi voi dong nay TRUOC khi quyet tiep: mot dong da tung duoc chi
 * dinh xe roi mo lai la mot cau chuyen khac voi mot dong chua ai cham. Lich su doc tu
 * `GET /transport/toll/candidates/:id` — duong da co tu truoc, chi chua co man hinh nao hien no.
 */
export function TollCandidateDetail({
  navigation,
  candidateId,
  canResolve,
  vehicleLabelOf,
  importLabelOf,
  onClose,
  onDecided,
}: {
  readonly navigation: NavigationInput;
  readonly candidateId: string;
  readonly canResolve: boolean;
  readonly vehicleLabelOf: (vehicleId: string) => string;
  readonly importLabelOf: (importId: string) => string | null;
  readonly onClose: () => void;
  readonly onDecided: (message: string) => void;
}) {
  const detail = toSectionQuery(useTollCandidateDetail(navigation, candidateId));
  const isDuplicate = detail.data?.candidate.matchState === 'DUPLICATE_CANDIDATE';
  // Chi hoi dong doi ung khi dong nay THAT SU dang o dien nghi trung — mot dong khac khong co gi de hoi.
  const peers = toSectionQuery(useTollDuplicatePeers(navigation, isDuplicate ? candidateId : null));

  if (detail.isLoading) return <LoadingState label="Đang đọc dòng và lịch sử quyết định…" />;
  if (detail.errorMessage !== null) {
    return <ErrorState message={detail.errorMessage} onRetry={detail.refetch} />;
  }
  if (detail.data === undefined) return null;

  const { candidate, decisions } = detail.data;
  const row = toTollCandidateRow(candidate);
  const importLabel = importLabelOf(candidate.importId);
  const peerLabelOf = (id: string): string | null => {
    const peer = peers.data?.peers.find((entry) => entry.candidate.id === id);
    return peer === undefined
      ? null
      : `dòng ${String(peer.candidate.rowNumber)} (${peer.importLabel ?? 'nguồn không rõ'})`;
  };
  const timeline = toTollDecisionTimeline(decisions, { vehicleLabelOf, rowLabelOf: peerLabelOf });
  const headingId = `toll-candidate-${candidate.id}`;

  return (
    <section className="tx-panel" aria-labelledby={headingId}>
      <div className="tx-detail__head">
        <h2 id={headingId}>
          Dòng {String(candidate.rowNumber)}
          {importLabel === null ? '' : ` · ${importLabel}`}
        </h2>
        <button type="button" className="tx-btn tx-btn--small" onClick={onClose}>
          Đóng chi tiết
        </button>
      </div>

      <dl className="tx-detail__grid">
        <DetailRow label="Nhà cung cấp">{row.providerLabel}</DetailRow>
        <DetailRow label="Số tài khoản trên tệp">{row.accountNoRaw}</DetailRow>
        <DetailRow label="Loại">{row.kindLabel}</DetailRow>
        <DetailRow label="Thời điểm qua trạm">{row.passedAtLabel}</DetailRow>
        <DetailRow label="Ngày nghiệp vụ">{row.businessDateLabel}</DetailRow>
        <DetailRow label="Số tiền (giữ nguyên dấu)">{row.amountLabel}</DetailRow>
        <DetailRow label="Trạm">{row.stationLabel}</DetailRow>
        <DetailRow label="Biển số trên tệp">
          {row.vehiclePlateRaw === '' ? '—' : row.vehiclePlateRaw}
        </DetailRow>
        <DetailRow label="Xe đã khớp">
          {candidate.vehicleId === null
            ? 'Chưa có — chờ người chỉ định'
            : vehicleLabelOf(candidate.vehicleId)}
        </DetailRow>
        <DetailRow label="Khớp xe">
          <StatusBadge label={row.matchStateLabel} tone={row.matchStateTone} />
        </DetailRow>
        <DetailRow label="Đối soát">
          <StatusBadge
            label={row.reviewStateLabel}
            tone={row.reviewStateTone}
            title="Trạng thái này nói đã có người nhìn dòng này chưa — không nói tiền đã trả."
          />
        </DetailRow>
        {row.rejectReasonLabel === null ? null : (
          <DetailRow label="Bỏ qua lúc đọc tệp vì">{row.rejectReasonLabel}</DetailRow>
        )}
        {candidate.duplicateOfCandidateId === null ? null : (
          <DetailRow label="Đã ghi là trùng với">
            {peerLabelOf(candidate.duplicateOfCandidateId) ?? 'một dòng khác'}
          </DetailRow>
        )}
      </dl>

      {isDuplicate ? (
        <TollDuplicateReview
          key={candidate.id}
          candidate={candidate}
          peers={peers}
          canResolve={canResolve}
          vehicleLabel={candidate.vehicleId === null ? null : vehicleLabelOf(candidate.vehicleId)}
          onDecided={onDecided}
        />
      ) : null}

      <div className="tx-detail__block">
        <h3>Lịch sử quyết định</h3>
        {timeline.length === 0 ? (
          <p className="tx-note">
            Chưa có quyết định nào cho dòng này. Nạp xong không có nghĩa là đã đối soát.
          </p>
        ) : (
          <ol
            className="tx-timeline"
            aria-label={`Lịch sử quyết định của dòng ${String(candidate.rowNumber)}`}
          >
            {timeline.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.actionLabel}</strong>
                <span>
                  {entry.atLabel} · {entry.actor}
                </span>
                {entry.vehicleChange === null ? null : <span>Xe: {entry.vehicleChange}</span>}
                {entry.matchChange === null ? null : <span>Khớp xe: {entry.matchChange}</span>}
                {entry.duplicateOfLabel === null ? null : (
                  <span>Trùng với: {entry.duplicateOfLabel}</span>
                )}
                {entry.note === null ? null : <span>Ghi chú: {entry.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
