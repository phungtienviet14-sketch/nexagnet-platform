import {
  DEFAULT_CHECKPOINT_POLICY,
  isRepeatable,
  requiredPredecessor,
  type CheckpointPolicy,
} from '../checkpoint/checkpoint-lifecycle.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import type { OperationalDocumentType } from '../document/document.types.js';
import type { DriverFieldAction } from './field.types.js';

/**
 * VIEC KE TIEP cua mot chang — ham THUAN, khong cham mang, khong cham dong ho.
 *
 * ============================================================================================
 * TEP NAY KHONG DAT MOT LUAT NAO. NO DOC LUAT DA CO.
 * ============================================================================================
 *
 * Do la dieu quan trong nhat can noi ve no. `requiredPredecessor()` va `isRepeatable()` den tu
 * `checkpoint-lifecycle.ts` — cung ham ma `CheckpointService` dung de TU CHOI. Nen mot nut chi hien
 * khi may chu that su se chap nhan lan bam do.
 *
 * Chep lai thu tu moc o day se cho ra HAI ban luat: mot ban quyet dinh nut nao hien, mot ban quyet
 * dinh lenh nao qua. Hai ban se lech nhau o lan sua thu ba, va trieu chung la mot cai nut bam vao
 * thi bao loi — dung kieu hong lam nguoi dung mat long tin vao ca ung dung.
 *
 * ============================================================================================
 * THU TU TRONG DANH SACH LA THU TU TREN MAN HINH
 * ============================================================================================
 *
 * `#279` O9 doi *"one/two taps for common steps"* o 390px. Man hinh ve theo thu tu tra ve, nen
 * viec THUONG LAM NHAT phai dung dau. Sap xep o day chu khong o giao dien: hai man hinh (di dong,
 * may bang) se ve cung mot thu tu, va thu tu do kiem duoc bang mot bai test.
 */

/**
 * NHAN tieng Viet cua tung moc — chu cua NGUOI DUNG, khong phai ten enum.
 *
 * `#279` O9: *"not internal state-machine jargon"*. Mot lai xe khong doc `PICKUP_DEPARTURE`; ho doc
 * `Roi diem lay hang`.
 */
const CHECKPOINT_LABEL: Readonly<Record<RunCheckpointType, string>> = {
  ASSIGNED: 'Đã nhận việc',
  DEPARTED: 'Bắt đầu chạy',
  PICKUP_ARRIVAL: 'Đã tới điểm lấy hàng',
  GATE_ENTRY: 'Đã vào cổng',
  LOADING: 'Đang xếp hàng',
  PICKUP_DEPARTURE: 'Rời điểm lấy hàng',
  DELIVERY_ARRIVAL: 'Đã đến nơi',
  DELIVERY_ACCEPTED: 'Khách đã nhận hàng',
  COMPLETED: 'Hoàn thành vận hành',
};

const DOCUMENT_LABEL: Readonly<Record<OperationalDocumentType, string>> = {
  GATE_PASS: 'Chụp giấy vào cổng',
  LOADING_SLIP: 'Chụp phiếu xếp hàng',
  WEIGH_TICKET: 'Chụp phiếu cân',
  DELIVERY_RECEIPT: 'Chụp biên nhận giao hàng',
  OTHER: 'Chụp chứng từ khác',
};

/**
 * THU TU HIEN cua bay moc thuoc mot CHANG.
 *
 * `ASSIGNED`/`DEPARTED`/`COMPLETED` khong nam o day: chung thuoc MUC VONG CHAY (`isRunScoped`), va
 * mot man hinh chang khong duoc phep bam chung — `evaluateCheckpoint` se tu choi bang
 * `CHECKPOINT_LEG_NOT_APPLICABLE`.
 */
const LEG_CHECKPOINT_ORDER: readonly RunCheckpointType[] = [
  'PICKUP_ARRIVAL',
  'GATE_ENTRY',
  'LOADING',
  'PICKUP_DEPARTURE',
  'DELIVERY_ARRIVAL',
  'DELIVERY_ACCEPTED',
];

/**
 * HAI CHANG DUONG cua mot chang, va moc DONG tung chang duong lai.
 *
 * ============================================================================================
 * VI SAO MOT VIEC DA QUA KHONG CON DUOC CHAO
 * ============================================================================================
 *
 * `evaluateCheckpoint` VAN cho phep ghi `GATE_ENTRY` sau khi da `PICKUP_DEPARTURE` — no chi doi
 * `PICKUP_ARRIVAL`, va do la dung: khong luat nghiep vu nao noi hai viec do phai theo thu tu.
 *
 * Nhung mot cai NUT thi khac mot lenh duoc phep. `receivedAt` cua moc la GIO MAY CHU luc bam, nen
 * mot lai xe dang tren duong bam `Da vao cong` se ghi mot lan vao cong vao dung luc ho khong o
 * cong. Do la mot moc SAI GIO, va no di thang vao dong thoi gian ma Ke toan doc de duyet phu cap.
 *
 * Duong ghi bu cho nhung lan quen bam da co, va no thuoc VAN HANH:
 * `CheckpointsController.record` (`transport.checkpoint.record`) — mot nguoi o van phong ghi ho,
 * co ten, co ly do. `#279` O9 doi man hinh lai xe chi hien *"the next useful action"*, va mot viec
 * da qua thi khong con la viec ke tiep.
 */
const STAGE_CLOSED_BY: readonly {
  readonly closer: RunCheckpointType;
  readonly stage: readonly RunCheckpointType[];
}[] = [
  {
    closer: 'PICKUP_DEPARTURE',
    stage: ['PICKUP_ARRIVAL', 'GATE_ENTRY', 'LOADING', 'PICKUP_DEPARTURE'],
  },
  { closer: 'DELIVERY_ACCEPTED', stage: ['DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED'] },
];

/** Moc nay thuoc mot chang duong DA DONG chua. */
const stageClosed = (type: RunCheckpointType, recorded: ReadonlySet<RunCheckpointType>): boolean =>
  STAGE_CLOSED_BY.some((entry) => entry.stage.includes(type) && recorded.has(entry.closer));

/** Chung tu goi y NGAY SAU moc nao — de nut chup nam dung cho tren man hinh. */
const DOCUMENT_AFTER: Readonly<Partial<Record<RunCheckpointType, OperationalDocumentType>>> = {
  GATE_ENTRY: 'GATE_PASS',
  LOADING: 'LOADING_SLIP',
  PICKUP_DEPARTURE: 'WEIGH_TICKET',
  DELIVERY_ACCEPTED: 'DELIVERY_RECEIPT',
};

export interface FieldActionInput {
  /** Loai moc DA GHI tren chinh chang nay. */
  readonly recordedTypes: readonly RunCheckpointType[];
  /** Loai chung tu CON HIEU LUC da ghi tren chang nay. */
  readonly documentTypes: readonly OperationalDocumentType[];
  /** Loai chung tu BAT BUOC theo chinh sach cua khach. */
  readonly requiredDocumentTypes: readonly OperationalDocumentType[];
  /** Chang dang co mot phien cho MO khong. */
  readonly hasOpenWaiting: boolean;
  /** Chang nay co mang mot don khong — chang RONG thi khong co bien nhan de ban giao. */
  readonly hasOrder: boolean;
  /** Da ghi buoc `dang giu to bien nhan` cho don nay chua. */
  readonly receiptHandoverRecorded: boolean;
  readonly runTerminal: boolean;
  readonly policy?: CheckpointPolicy;
}

/**
 * Danh sach nut cho MOT chang.
 *
 * Rong la mot ket qua HOP LE va thuong gap: mot chang da giao xong, da chup bien nhan, da ban giao
 * thi khong con viec gi. Man hinh hien "Da xong" thay vi mot danh sach trong khong giai thich.
 */
export function fieldActionsFor(input: FieldActionInput): readonly DriverFieldAction[] {
  if (input.runTerminal) return [];

  const policy = input.policy ?? DEFAULT_CHECKPOINT_POLICY;
  const actions: DriverFieldAction[] = [];
  const recorded = new Set(input.recordedTypes);
  const captured = new Set(input.documentTypes);

  for (const type of LEG_CHECKPOINT_ORDER) {
    // MOC: chi hien khi `evaluateCheckpoint` that su se cho qua. Xem khoi chu thich dau tep.
    const predecessor = requiredPredecessor(type);
    const predecessorDone = predecessor === null || recorded.has(predecessor);
    const alreadyDone = recorded.has(type) && !isRepeatable(type);

    if (predecessorDone && !alreadyDone && !stageClosed(type, recorded)) {
      actions.push({
        kind: 'CHECKPOINT',
        label: CHECKPOINT_LABEL[type],
        checkpointType: type,
        requiresLocation: policy.locationRequiredTypes.includes(type),
        required: true,
      });
    }

    /*
     * NUT `Bat dau cho` nam NGAY SAU `Da den noi`, va do la thu tu cua mot ngay lam viec: lai xe
     * bam den noi, roi moi biet nguoi nhan chua san sang.
     *
     * No BIEN MAT khi nguoi nhan da nhan hang — `evaluateWaitingStart` tra
     * `WAITING_DELIVERY_ALREADY_ACCEPTED`, nen hien no se la mot nut bam vao thi bao loi.
     */
    if (
      type === 'DELIVERY_ARRIVAL' &&
      recorded.has('DELIVERY_ARRIVAL') &&
      !recorded.has('DELIVERY_ACCEPTED') &&
      !input.hasOpenWaiting
    ) {
      actions.push({
        kind: 'WAITING_START',
        label: 'Bắt đầu chờ',
        requiresLocation: false,
        required: false,
      });
    }

    // CHUNG TU goi y ngay sau moc tuong ung — chi khi moc do da ghi va chua co to nao.
    const documentType = DOCUMENT_AFTER[type];
    if (documentType !== undefined && recorded.has(type) && !captured.has(documentType)) {
      actions.push({
        kind: 'DOCUMENT',
        label: DOCUMENT_LABEL[documentType],
        documentType,
        requiresLocation: false,
        required: input.requiredDocumentTypes.includes(documentType),
      });
    }
  }

  /*
   * BAN GIAO BIEN NHAN (`#279` O7) — nut cuoi cung, va chi hien khi co mot don de ban giao.
   *
   * Mot chang RONG khong mang don (bat bien cua `TransportRunLeg`), nen khong co to bien nhan nao
   * de lai xe cam ve. Hien nut o do se la mot cau hoi khong co cau tra loi.
   */
  if (input.hasOrder && recorded.has('DELIVERY_ACCEPTED') && !input.receiptHandoverRecorded) {
    actions.push({
      kind: 'RECEIPT_HANDOVER',
      label: 'Tôi đang giữ biên nhận',
      requiresLocation: false,
      required: false,
    });
  }

  return actions;
}
