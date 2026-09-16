'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { ConfirmAction, ErrorState, LoadingState } from '../components/SectionState';
import { TOLL_REVIEW_ACTION_LABEL } from '../customer-view';
import type { SectionQuery } from '../hooks/useTransportWorkspace';
import type { TollDuplicatePeerListing } from '../toll-report-types';
import { transportApi } from '../transport-api';
import type { TollCandidate } from '../transport-types';
import {
  clearDuplicateConsequence,
  flagDuplicateConsequence,
  toTollDuplicateReviewModel,
  type TollDuplicatePeerOption,
} from '../workspace/toll-duplicates';

type DuplicateDecision = 'FLAG_DUPLICATE' | 'CLEAR_DUPLICATE';

/**
 * QUYET TRUNG cho MOT dong — `#314` G8.
 *
 * ==============================================================================================
 * BA DIEU LAM CHO THAO TAC NAY AN TOAN DE KIEM TOAN
 * ==============================================================================================
 *
 *   1. KHONG CO DONG GOC MAC DINH. Nguoi doi soat chon DUNG MOT dong trong cac dong mang cung dau van;
 *      dong da bi ghi trung (ke ca ghi trung voi chinh dong nay) khong chon duoc — chan vong trung.
 *   2. HAU QUA NOI TRUOC KHI GHI. Hop xac nhan noi dong nay se roi khoi tong chi phi nao, hoac se
 *      duoc tinh vao dau — dung theo luat `planReview` cua may chu.
 *   3. GHI THEM, KHONG GHI DE. Moi quyet dinh la mot dong lich su (co ghi chu neu nguoi quyet muon),
 *      va `Mở lại` la duong ra — khong co duong xoa.
 */
export function TollDuplicateReview({
  candidate,
  peers,
  canResolve,
  vehicleLabel,
  onDecided,
}: {
  readonly candidate: TollCandidate;
  readonly peers: SectionQuery<TollDuplicatePeerListing>;
  readonly canResolve: boolean;
  /** Bien so cua xe dang gan tren dong (neu co) — de cau hau qua noi dung xe nao. */
  readonly vehicleLabel: string | null;
  readonly onDecided: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<DuplicateDecision | null>(null);

  const rowNumber = String(candidate.rowNumber);

  const decide = useMutation({
    mutationFn: (input: {
      readonly action: DuplicateDecision;
      readonly targetId: string | null;
      readonly note: string;
    }) =>
      transportApi.toll.review(candidate.id, {
        action: input.action,
        vehicleId: null,
        duplicateOfCandidateId: input.action === 'FLAG_DUPLICATE' ? input.targetId : null,
        note: input.note.trim() === '' ? null : input.note.trim(),
      }),
    onSuccess: (_updated, input) => {
      setPending(null);
      setChosenId(null);
      setNote('');
      onDecided(
        input.action === 'FLAG_DUPLICATE'
          ? `Đã ghi dòng ${rowNumber} là trùng. Số tiền của dòng này không còn được tính vào chi phí nào.`
          : `Đã bỏ nghi trùng cho dòng ${rowNumber}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });
    },
    onError: () => setPending(null),
  });

  const model = toTollDuplicateReviewModel({
    candidate,
    listing: peers.data ?? null,
    canResolve,
  });
  const target = model.peers.find((peer) => peer.id === chosenId && peer.selectable) ?? null;
  const consequence =
    pending === 'FLAG_DUPLICATE' && target !== null
      ? flagDuplicateConsequence(candidate, target)
      : pending === 'CLEAR_DUPLICATE'
        ? clearDuplicateConsequence(candidate, vehicleLabel)
        : null;
  const headingId = `toll-duplicate-${candidate.id}`;

  return (
    <div className="tx-detail__block" aria-labelledby={headingId} role="group">
      <h3 id={headingId}>Quyết trùng cho dòng {rowNumber}</h3>

      {model.lockedReason === null ? null : (
        <p className="tx-note tx-note--warn">{model.lockedReason}</p>
      )}
      {peers.isLoading ? <LoadingState label="Đang tìm các dòng mang cùng dấu vân…" /> : null}
      {peers.errorMessage === null ? null : (
        <ErrorState message={peers.errorMessage} onRetry={peers.refetch} />
      )}
      {peers.data === undefined ? null : <p className="tx-note">{model.peerNotice}</p>}

      {model.peers.length === 0 ? null : (
        <DataTable<TollDuplicatePeerOption>
          caption={`Các dòng mang cùng dấu vân với dòng ${rowNumber}`}
          rows={model.peers}
          rowKey={(peer) => peer.id}
          columns={[
            {
              key: 'choose',
              header: 'Dòng gốc',
              render: (peer) => (
                <input
                  type="radio"
                  name={`toll-duplicate-target-${candidate.id}`}
                  value={peer.id}
                  checked={chosenId === peer.id}
                  disabled={!model.canDecide || !peer.selectable}
                  aria-label={`Chọn dòng ${String(peer.rowNumber)} của nguồn ${peer.sourceLabel} làm dòng gốc`}
                  onChange={() => setChosenId(peer.id)}
                />
              ),
            },
            {
              key: 'source',
              header: 'Nguồn',
              isRowHeader: true,
              render: (peer) => peer.sourceLabel,
            },
            // KHONG tien to "#": be mat khach chan moi khuon `#<hai chu so tro len>`.
            { key: 'row', header: 'Dòng', render: (peer) => String(peer.rowNumber) },
            { key: 'date', header: 'Ngày', render: (peer) => peer.businessDateLabel },
            { key: 'passed', header: 'Thời điểm qua trạm', render: (peer) => peer.passedAtLabel },
            {
              key: 'amount',
              header: 'Số tiền',
              isNumeric: true,
              render: (peer) => peer.amountLabel,
            },
            { key: 'station', header: 'Trạm', render: (peer) => peer.stationLabel },
            { key: 'plate', header: 'Biển số trên tệp', render: (peer) => peer.vehiclePlateRaw },
            {
              key: 'match',
              header: 'Khớp xe',
              render: (peer) => (
                <StatusBadge label={peer.matchStateLabel} tone={peer.matchStateTone} />
              ),
            },
            {
              key: 'review',
              header: 'Đối soát',
              render: (peer) => (
                <StatusBadge label={peer.reviewStateLabel} tone={peer.reviewStateTone} />
              ),
            },
            {
              key: 'why',
              header: 'Vì sao không chọn được',
              render: (peer) => peer.blockedReason ?? '—',
            },
          ]}
        />
      )}
      {model.truncatedNotice === null ? null : <p className="tx-note">{model.truncatedNotice}</p>}

      {!model.canDecide ? null : (
        <>
          <label className="tx-field">
            <span>Ghi chú cho lịch sử (không bắt buộc)</span>
            <textarea
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="tx-detail__actions">
            <button
              type="button"
              className="tx-btn tx-btn--stop"
              disabled={!model.canFlag || target === null || decide.isPending}
              onClick={() => {
                decide.reset();
                setPending('FLAG_DUPLICATE');
              }}
            >
              Ghi là trùng với dòng gốc đã chọn
            </button>
            <button
              type="button"
              className="tx-btn"
              disabled={!model.canClear || decide.isPending}
              onClick={() => {
                decide.reset();
                setPending('CLEAR_DUPLICATE');
              }}
            >
              {TOLL_REVIEW_ACTION_LABEL.CLEAR_DUPLICATE}
            </button>
          </div>
          {model.canFlag && target === null ? (
            <p className="tx-note">Chọn một dòng gốc trong bảng trên để ghi dòng này là trùng.</p>
          ) : null}
        </>
      )}
      {decide.error === null ? null : <ErrorState message={decide.error.message} />}

      <ConfirmAction
        open={pending !== null && consequence !== null}
        title={
          pending === 'FLAG_DUPLICATE'
            ? `Ghi dòng ${rowNumber} là trùng?`
            : `Bỏ nghi trùng cho dòng ${rowNumber}?`
        }
        detail={consequence}
        confirmLabel={pending === 'FLAG_DUPLICATE' ? 'Ghi là trùng' : 'Bỏ nghi trùng'}
        isDestructive={pending === 'FLAG_DUPLICATE'}
        isBusy={decide.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null)
            decide.mutate({ action: pending, targetId: target?.id ?? null, note });
        }}
      />
    </div>
  );
}
