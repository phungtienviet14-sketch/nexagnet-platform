import { transportApi } from '../transport-api';
import type { DriverLocationObservation } from '../transport-types';

/**
 * CHUNG CU VI TRI CHO MOT LAN BAM — `#327`.
 *
 * ==============================================================================================
 * TEP NAY LAM DUNG MOT VIEC, VA NO LA MOT VIEC BA BUOC
 * ==============================================================================================
 *
 * `DELIVERY_ARRIVAL` va `DELIVERY_ACCEPTED` BAT BUOC di kem mot ban dinh vi (`#232` D-08), va ban
 * do phai thuoc ve mot phien cua CHINH lai xe dang bam. Nen mot cham vao nut do khong phai mot lan
 * goi HTTP — no la mot chuoi:
 *
 *   1. doc vi tri tu trinh duyet;
 *   2. mo (hoac dung lai) mot phien bam vi tri tren VONG CHAY do;
 *   3. gui ban dinh vi vao phien do, lay `observationId`;
 *   4. roi moi ghi moc, kem `observationId`.
 *
 * Truoc ban nay, man hinh hien "(cần vị trí)" roi goi `recordCheckpoint()` KHONG kem
 * `observationId` — nen nut do luon tra `400 CHECKPOINT_LOCATION_REQUIRED`. Nhan noi dung, hanh vi
 * khong.
 *
 * ==============================================================================================
 * TU CHOI QUYEN LA MOT LOI, KHONG PHAI MOT TRUONG BO TRONG
 * ==============================================================================================
 *
 * `SiteIntakeScreen` co mot ham doc vi tri RIENG va no NUOT loi — co y: mot lai xe khong bat dinh
 * vi van phai chon duoc kho bang tay. O day thi nguoc lai: bo trong se ghi mot moc "toi da den
 * noi" KHONG co gi chung minh, va do dung la thu ma chinh sach nay sinh ra de chan. Nen ham duoi
 * day NEM, va nguoi goi dung lai truoc khi cham vao duong ghi moc.
 */

/** Mot vi tri DA CHUP, giu nguyen qua moi lan thu lai cua cung mot nut. */
export interface CapturedPosition {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number | null;
  /** Dong ho MAY KHACH, ISO-8601. May chu ghi gio nhan RIENG va chi coi day la loi khai. */
  readonly capturedAt: string;
}

/**
 * MOT LAN BAM co can vi tri — trang thai giu qua cac lan thu lai.
 *
 * Ba truong, va ca ba deu ton tai vi mot ly do chong lap CU THE:
 *
 *   · `observationEventId` — khoa chan phat lai cua BAN DINH VI. Sinh moi o lan thu hai se tao mot
 *     ban dinh vi thu hai cho cung mot khoanh khac;
 *   · `position` — toa do DA CHUP. Doc lai GPS o lan thu hai se cho mot toa do KHAC, va may chu se
 *     tu choi bang `OBSERVATION_EVENT_ID_REUSED` (dung khoa, khac noi dung) — mot lan tu choi
 *     hoan toan chinh xac ma nguoi dung khong hieu noi;
 *   · `observationId` — ket qua DA CO. Neu ban dinh vi da vao ma cau tra loi cua buoc ghi moc bi
 *     mat tren duong ve, lan bam lai KHONG duoc di lai buoc 1-3.
 */
export interface LocationProofSlot {
  readonly observationEventId: string;
  position?: CapturedPosition;
  observationId?: string;
}

/** Loi CO KIEU, de nguoi goi phan biet "khong lay duoc vi tri" voi "may chu tu choi". */
export class LocationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationUnavailableError';
  }
}

const DENIED =
  'Chưa bật quyền vị trí nên không ghi được mốc này. Bật định vị cho trình duyệt rồi bấm lại.';
const UNSUPPORTED =
  'Thiết bị này không đọc được vị trí nên không ghi được mốc. Dùng máy có định vị để bấm mốc này.';
const TIMED_OUT =
  'Chưa bắt được vị trí (máy đang dò GPS). Ra chỗ thoáng rồi bấm lại — mốc chưa được ghi.';

/**
 * VI TRI TU TRINH DUYET, hoac mot loi noi RO NGUYEN NHAN.
 *
 * `maximumAge: 0` — khong nhan mot ban ghi cu. Mot ban trong bo dem cua trinh duyet noi ve noi lai
 * xe DA TUNG o, va mot moc "toi da den noi" dua tren no la mot bang chung sai.
 *
 * `timeout` 15 giay roi bo cuoc: mot may thu GNSS lanh may can hang chuc giay, nhung mot man hinh
 * quay mai la mot man hinh hong — va lai xe can biet la CHUA GHI de con bam lai.
 */
export async function readBrowserPosition(
  now: () => Date = () => new Date(),
): Promise<CapturedPosition> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
    throw new LocationUnavailableError(UNSUPPORTED);
  }
  return new Promise<CapturedPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
          capturedAt: now().toISOString(),
        }),
      (error) =>
        reject(
          new LocationUnavailableError(
            error.code === error.PERMISSION_DENIED
              ? DENIED
              : error.code === error.TIMEOUT
                ? TIMED_OUT
                : UNSUPPORTED,
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export interface LocationProofPorts {
  readonly openSession: (runId: string) => Promise<{ readonly id: string }>;
  readonly report: (
    sessionId: string,
    observation: {
      readonly clientEventId: string;
      readonly latitude: number;
      readonly longitude: number;
      readonly accuracyMetres: number | null;
      readonly capturedAt: string;
    },
  ) => Promise<DriverLocationObservation>;
  readonly capture: () => Promise<CapturedPosition>;
}

/**
 * Cong MAC DINH — duong that, di qua `transportApi`.
 *
 * `source: 'DEVICE_FUSED'` chu khong `DEVICE_GNSS`, va do la mot khang dinh chu khong mot mac dinh
 * tuy tien: Geolocation API cua trinh duyet la mot nguon TRON (GNSS + wifi + tram phat song) va no
 * KHONG noi ra minh vua dung cai nao. Khai `DEVICE_GNSS` la tu nang muc tin cay cua mot thu khong
 * ai do duoc — va `accuracyMetres` roi se mau thuan voi loi khai do ngay trong cung mot hang.
 *
 * `TELEMATICS` thi khong bao gio: may chu tu choi no o bien vao (`#297` T3), vi mot chiec dien
 * thoai tu khai minh la phan cung tren xe se pha huy chinh phep doi chieu cheo giua hai nguon.
 */
export const defaultLocationProofPorts: LocationProofPorts = {
  openSession: (runId) => transportApi.me.openTrackingSession({ runId }),
  report: async (sessionId, observation) => {
    const accepted = await transportApi.me.reportObservations(sessionId, [
      {
        clientEventId: observation.clientEventId,
        latitude: observation.latitude,
        longitude: observation.longitude,
        accuracyMetres: observation.accuracyMetres,
        source: 'DEVICE_FUSED',
        capturedAt: observation.capturedAt,
        mockLocationReported: null,
      },
    ]);
    const first = accepted[0];
    if (first === undefined) {
      // Hop dong noi mang tra ve CUNG DO DAI voi dau vao. Mot mang rong la mot loi hop dong, va
      // roi ve `undefined` o day se lam buoc ghi moc gui len mot `observationId` rong.
      throw new Error('Hệ thống không trả về bản định vị vừa gửi — chưa ghi được mốc.');
    }
    return first;
  },
  capture: () => readBrowserPosition(),
};

/**
 * BA BUOC DAU CUA CHUOI, va mot lan thu lai KHONG lam lai buoc nao da xong.
 *
 * Tra ve `observationId` de nguoi goi dua thang vao `recordCheckpoint`. `slot` bi SUA TAI CHO — co
 * y: no song trong mot `useRef` cua man hinh, va no phai giu duoc gia tri qua cac lan render lan
 * cac lan bam lai. Mot ban sao bat bien o day se lam dung cai ma no dinh chan.
 */
export async function ensureLocationProof(
  runId: string,
  slot: LocationProofSlot,
  ports: LocationProofPorts = defaultLocationProofPorts,
): Promise<string> {
  // Da co roi: lan bam nay la mot lan thu lai sau khi buoc ghi moc that bai. Khong mo phien moi,
  // khong doc GPS lan nua, khong gui them mot ban dinh vi nao.
  if (slot.observationId !== undefined) return slot.observationId;

  // Toa do chi chup MOT LAN cho mot nut. Xem chu thich cua `LocationProofSlot`.
  const position = slot.position ?? (await ports.capture());
  slot.position = position;

  const session = await ports.openSession(runId);
  const observation = await ports.report(session.id, {
    clientEventId: slot.observationEventId,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracyMetres: position.accuracyMetres,
    capturedAt: position.capturedAt,
  });

  slot.observationId = observation.id;
  return observation.id;
}
