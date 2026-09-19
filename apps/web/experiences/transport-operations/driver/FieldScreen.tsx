'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { newCorrelationKey, transportApi } from '../transport-api';
import type { DriverFieldAction } from '../transport-types';
import { toFieldScreen, type FieldLegCard } from '../workspace/driver-field';
import { toOperationalDocumentInput } from '../workspace/file-evidence';

/**
 * MAN HINH HIEN TRUONG cua lai xe — `#279` O9.
 *
 * ============================================================================================
 * MAN HINH NAY KHONG BIET QUY TRINH
 * ============================================================================================
 *
 * No khong biet `PICKUP_DEPARTURE` phai di truoc `DELIVERY_ARRIVAL`, khong biet moc nao doi vi tri,
 * khong biet chung tu nao bat buoc. May chu tra ve mot danh sach NUT (`nextActions`), va man hinh
 * ve chung ra theo thu tu.
 *
 * Do la mot lua chon co y. Ba luat do song o `checkpoint-lifecycle.ts` va
 * `document-lifecycle.ts`; chep chung sang day se cho ra HAI ban, va ban tren dien thoai se cu roi
 * lai sau moi lan luat doi. Trieu chung la mot cai nut bam vao thi bao loi — dung kieu hong lam
 * nguoi dung mat long tin vao ca ung dung.
 *
 * ============================================================================================
 * KHOA CHONG LAP SINH MOT LAN, GIU QUA MOI LAN THU LAI
 * ============================================================================================
 *
 * `#279` O10: *"clientEventId generated once ... retry keeps same identity"*. Sinh moi o moi lan
 * goi lai se bien mot lan mat song thanh hai moc — va mot moc thua tren dong thoi gian la mot con
 * so sai trong ho so duyet phu cap.
 *
 * `eventKeys` giu khoa theo TUNG NUT (`legId` + nhan), nen hai nut khac nhau khong dung chung mot
 * khoa, va mot nut bam lai ba lan van chi la mot su kien.
 */
export function DriverFieldWork() {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const eventKeys = useRef(new Map<string, string>());
  const uploadedFileIds = useRef(new Map<string, string>());

  const work = useQuery({
    queryKey: ['transport', 'me', 'field-work'],
    queryFn: () => transportApi.me.fieldWork(),
  });

  const keyFor = (slot: string): string => {
    const existing = eventKeys.current.get(slot);
    if (existing !== undefined) return existing;
    const created = newCorrelationKey();
    eventKeys.current.set(slot, created);
    return created;
  };

  const act = useMutation({
    mutationFn: async (input: {
      readonly card: FieldLegCard;
      readonly action: DriverFieldAction;
      readonly file?: File;
    }) => {
      const { card, action } = input;
      const clientEventId = keyFor(`${card.legId}:${action.label}`);

      if (action.kind === 'CHECKPOINT' && action.checkpointType !== undefined) {
        return transportApi.me.recordCheckpoint({
          type: action.checkpointType,
          runId: card.runId,
          legId: card.legId,
          clientEventId,
        });
      }
      if (action.kind === 'WAITING_START' && card.arrivalCheckpointId !== null) {
        return transportApi.me.startWaiting({
          runId: card.runId,
          legId: card.legId,
          arrivalCheckpointId: card.arrivalCheckpointId,
          reason: 'RECEIVER_NOT_READY',
          clientEventId,
        });
      }
      if (action.kind === 'DOCUMENT' && action.documentType !== undefined) {
        if (input.file === undefined) throw new Error('Chọn ảnh hoặc PDF trước khi ghi chứng từ.');
        const fileSlot = `${card.legId}:${action.label}:${input.file.name}:${input.file.size}:${input.file.lastModified}`;
        const heldFileId = uploadedFileIds.current.get(fileSlot);
        const fileId =
          heldFileId ?? (await transportApi.files.uploadOperationalDocument(input.file)).id;
        uploadedFileIds.current.set(fileSlot, fileId);
        return transportApi.me.recordDocument(
          toOperationalDocumentInput({
            fileId,
            type: action.documentType,
            runId: card.runId,
            legId: card.legId,
            clientEventId: keyFor(fileSlot),
          }),
        );
      }
      if (action.kind === 'RECEIPT_HANDOVER' && card.orderId !== null) {
        return transportApi.me.recordReceiptHandover({
          orderId: card.orderId,
          legId: card.legId,
          externalNote: 'Biên nhận giấy có chữ ký người nhận',
          clientEventId,
        });
      }
      throw new Error('Việc này chưa bấm được — thiếu dữ liệu neo.');
    },
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
    },
    // KHONG xoa khoa: lan thu lai phai mang DUNG khoa cu.
    onError: (error: Error) => setFailure(error.message),
  });

  if (work.isLoading) return <LoadingState label="Đang đọc việc hiện trường…" />;
  if (work.error !== null) {
    return (
      <ErrorState message={(work.error as Error).message} onRetry={() => void work.refetch()} />
    );
  }
  if (work.data === undefined) return <EmptyState title="Chưa đọc được việc hiện trường." />;

  const model = toFieldScreen(work.data);

  return (
    <>
      <h1 className="tx-driver__title">Hiện trường</h1>
      <p className="tx-driver__lead" data-testid="field-headline">
        {model.headline}
      </p>
      {failure === null ? null : <ErrorState message={failure} />}

      {model.current === null ? (
        <EmptyState title="Không còn việc nào cần bấm ngay." />
      ) : (
        <FieldLeg
          card={model.current}
          pending={act.isPending}
          onAct={(action, file) =>
            act.mutate({ card: model.current as FieldLegCard, action, file })
          }
        />
      )}

      {model.others.length === 0 ? null : (
        <section className="tx-driver__card" aria-label="Chặng khác">
          <h2>Chặng khác</h2>
          <ul className="tx-driver__list">
            {model.others.map((card) => (
              <li key={card.legId} data-testid="field-other-leg">
                <strong>{card.title}</strong> — {card.route} · {card.phaseLabel}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * MOT CHANG, va nhung viec bam duoc tren no.
 *
 * `tx-btn--wide` cho MOI nut: `#279` O9 doi *"390px usable"* va *"one/two taps for common steps"*.
 * Mot hang hai nut o 390px cho ra hai vung cham hep hon dau ngon tay cua mot nguoi dang deo gang.
 */
function FieldLeg({
  card,
  pending,
  onAct,
}: {
  readonly card: FieldLegCard;
  readonly pending: boolean;
  readonly onAct: (action: DriverFieldAction, file?: File) => void;
}) {
  const [documentFiles, setDocumentFiles] = useState<ReadonlyMap<string, File>>(new Map());
  return (
    <section
      className="tx-driver__card"
      aria-label="Chặng đang làm"
      data-testid="field-current-leg"
    >
      <h2>{card.title}</h2>
      <dl className="tx-driver__facts">
        <dt>Tuyến</dt>
        <dd data-testid="field-route">{card.route}</dd>
        <dt>Trạng thái</dt>
        <dd data-testid="field-phase">{card.phaseLabel}</dd>
        <dt>Đơn</dt>
        <dd>{card.orderCode ?? '—'}</dd>
      </dl>

      {card.waitingElapsed === null ? null : (
        <p className="tx-driver__lead" data-testid="field-waiting">
          Đang chờ người nhận: <strong>{card.waitingElapsed}</strong>
        </p>
      )}

      {card.handoverLabel === null ? null : (
        <p className="tx-driver__lead" data-testid="field-handover">
          {card.handoverLabel}
        </p>
      )}

      {card.capturedDocuments.length === 0 ? null : (
        <p className="tx-driver__lead" data-testid="field-captured">
          Đã chụp: {card.capturedDocuments.join(', ')}
        </p>
      )}

      {card.missingDocuments.length === 0 ? null : (
        <p className="tx-driver__lead" data-testid="field-missing">
          Còn thiếu: {card.missingDocuments.join(', ')}
        </p>
      )}

      <div className="tx-driver__actions">
        {card.actions.map((action) => {
          const file = documentFiles.get(action.label);
          return (
            <div key={action.label}>
              {action.kind === 'DOCUMENT' ? (
                <label className="tx-field">
                  <span>Tệp cho {action.label}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected === undefined) return;
                      setDocumentFiles((held) => new Map(held).set(action.label, selected));
                    }}
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="tx-btn tx-btn--go tx-btn--wide"
                disabled={pending || (action.kind === 'DOCUMENT' && file === undefined)}
                data-testid="field-action"
                onClick={() => onAct(action, file)}
              >
                {action.label}
                {action.requiresLocation ? ' (cần vị trí)' : ''}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
