import type { DriverFieldAction, DriverFieldLeg, DriverFieldWork } from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man hinh hien truong — `#279` O9.
 *
 * ============================================================================================
 * QUYET DINH "HIEN GI" KHONG NAM TRONG JSX
 * ============================================================================================
 *
 * Cung quy uoc voi `toSiteIntakeScreen()` cua `#267`: sau ba lan sua giao dien, cau *"chang nao la
 * chang dang lam"* van doc lai duoc o mot ham thuan co bai kiem — thay vi nam rai trong mot chuoi
 * `&&` giua hai the `<div>`.
 *
 * MAY CHU da tinh `nextActions`. Tep nay KHONG tinh lai: no chi chon CHANG nao hien truoc va gap
 * vai chuoi cho de doc. Tinh lai o day se cho ra hai ban luat, va ban tren dien thoai se cu roi lai
 * sau moi lan luat doi.
 */

/** Nhan tieng Viet cua giai doan mot chang — de nguoi doc, khong de may loc. */
const PHASE_LABEL: Readonly<Record<DriverFieldLeg['phase'], string>> = {
  PLANNED: 'Chưa bắt đầu',
  AT_PICKUP: 'Đang ở điểm lấy hàng',
  LOADING: 'Đang xếp hàng',
  IN_TRANSIT: 'Đang trên đường',
  ARRIVED: 'Đã đến nơi giao',
  DELIVERED: 'Đã giao xong',
};

const DOCUMENT_LABEL: Readonly<Record<string, string>> = {
  GATE_PASS: 'Giấy vào cổng',
  LOADING_SLIP: 'Phiếu xếp hàng',
  WEIGH_TICKET: 'Phiếu cân',
  DELIVERY_RECEIPT: 'Biên nhận giao hàng',
  OTHER: 'Chứng từ khác',
};

const HANDOVER_LABEL: Readonly<Record<string, string>> = {
  WITH_DRIVER: 'Biên nhận đang ở chỗ bạn',
  RETURNED_TO_OFFICE: 'Văn phòng đã nhận biên nhận',
  SUBMITTED_FOR_CONFIRMATION: 'Văn phòng đã gửi đi xác nhận',
};

export interface FieldLegCard {
  readonly legId: string;
  readonly runId: string;
  readonly runCode: string;
  readonly title: string;
  readonly route: string;
  readonly phaseLabel: string;
  readonly orderCode: string | null;
  readonly waitingElapsed: string | null;
  readonly capturedDocuments: readonly string[];
  readonly missingDocuments: readonly string[];
  readonly handoverLabel: string | null;
  readonly arrivalCheckpointId: string | null;
  readonly orderId: string | null;
  readonly actions: readonly DriverFieldAction[];
}

export interface FieldScreenModel {
  readonly headline: string;
  /** Chang DANG LAM — hien dau, mo san. `null` khi khong con viec gi. */
  readonly current: FieldLegCard | null;
  /** Cac chang con lai cua cung vong chay, theo thu tu. */
  readonly others: readonly FieldLegCard[];
  readonly serverNow: string;
}

/**
 * `mm:ss` / `h giờ mm` cho mot khoang giay.
 *
 * Doc tu `elapsedSeconds` MAY CHU da tinh, khong tu `Date.now()` cua may nay — `#279` O5:
 * *"elapsed display derives from server start time"*. Mot chiec dien thoai lech mot tieng se hien
 * "da cho 4 tieng" trong khi may chu biet la 3, va con so nguoi ta doc chinh la con so nguoi ta
 * nhap vao de nghi phu cap.
 */
export const formatElapsed = (seconds: number): string => {
  const safe = seconds < 0 ? 0 : Math.floor(seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes} phút`;
  return `${hours} giờ ${String(minutes).padStart(2, '0')} phút`;
};

const toCard = (leg: DriverFieldLeg, runId: string, runCode: string): FieldLegCard => ({
  legId: leg.legId,
  runId,
  runCode,
  title: leg.kind === 'EMPTY' ? `Chặng ${leg.sequence} — chạy rỗng` : `Chặng ${leg.sequence}`,
  route: `${leg.originLabel} → ${leg.destinationLabel}`,
  phaseLabel: PHASE_LABEL[leg.phase],
  orderCode: leg.orderCode,
  waitingElapsed: leg.waiting === null ? null : formatElapsed(leg.waiting.elapsedSeconds),
  capturedDocuments: leg.documents.map(
    (document) => DOCUMENT_LABEL[document.type] ?? document.type,
  ),
  missingDocuments: leg.missingDocumentTypes.map((type) => DOCUMENT_LABEL[type] ?? type),
  handoverLabel:
    leg.receiptHandover === null ? null : (HANDOVER_LABEL[leg.receiptHandover] ?? null),
  arrivalCheckpointId: leg.arrivalCheckpointId,
  orderId: leg.orderId,
  actions: leg.nextActions,
});

/**
 * CHANG DANG LAM la chang DAU TIEN con viec de bam.
 *
 * "Dau tien con viec" chu khong "chang co so thu tu nho nhat chua giao xong": mot chang da giao
 * xong nhung chua chup bien nhan VAN con viec, va do dung la thu lai xe phai lam tiep. Chon theo
 * so thu tu se day ho sang chang sau trong khi to giay o chang truoc chua chup.
 */
export function toFieldScreen(work: DriverFieldWork): FieldScreenModel {
  const cards = work.runs.flatMap((run) =>
    run.legs.map((leg) => toCard(leg, run.runId, run.runCode)),
  );

  const current = cards.find((card) => card.actions.length > 0) ?? null;
  const others = cards.filter((card) => card.legId !== current?.legId);

  return {
    headline:
      cards.length === 0
        ? 'Chưa có chuyến nào được phân công cho bạn.'
        : current === null
          ? 'Đã làm xong mọi việc hiện trường của các chuyến đang chạy.'
          : `${current.runCode} — ${current.phaseLabel}`,
    current,
    others,
    serverNow: work.serverNow,
  };
}
