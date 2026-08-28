import { Injectable } from '@nestjs/common';

/**
 * SUC KHOE CUA KENH DOC — de "im vi khong ai nhan" KHAC DUOC voi "im vi da chet".
 *
 * ==============================================================================================
 * SU CO DA SINH RA TEP NAY (reference-platform-stack.md §7.1, do 28/08/2026):
 *
 * Kenh doc chinh cua GD1 khong mang ve mot tin nao trong ~44 gio. Trong suot 44 gio do, BA tin
 * hieu deu xanh: log cua tien trinh (`zca-js listener: connected`, roi im), `/health`
 * (`{"status":"ok","uptimeSeconds":88501}`), va tin hieu deploy.
 *
 * Va socket THUC SU da chet: log co dong `zca-js listener closed (1000): NORMAL_CLOSURE`. Ma
 * `1000` la dong BINH THUONG — khong ngoai le, khong retry. Lan "hoi phuc" ngay sau do la do
 * container duoc tao lai khi deploy, khong phai do listener tu noi lai.
 *
 * Diem cot loi: hai trang thai duoi day KHONG PHAN BIET DUOC tu ben ngoai, va do moi la rui ro —
 * lon hon han viec kenh im:
 *
 *   | Trang thai                          | Quan sat thay gi              |
 *   | khong ai nhan trong 44 gio          | log im, /health ok, 0 tin moi |
 *   | socket da chet, listener khong biet | log im, /health ok, 0 tin moi |
 *
 * ==============================================================================================
 * VI SAO KHONG DOC TU DATABASE:
 *
 * "Tin cuoi cung ve luc nao" tra duoc bang mot cau SELECT tren bang tin nhan. Nhung cau tra loi
 * do KHONG phan biet duoc hai hang tren: ca hai deu cho ra "44 gio truoc". Cai thieu khong phai
 * du lieu ve TIN, ma du lieu ve SOCKET — va socket chi ton tai trong tien trinh nay.
 *
 * Nen o day la mot quan sat TRONG TIEN TRINH, va no khai bao thang gioi han cua minh:
 * `observedSince` = luc tien trinh bat dau nhin. Sau mot lan khoi dong lai, `lastInboundAt` la
 * `null` — do la SU THAT ("chua thay tin nao ke tu khi khoi dong"), khong phai mot cho trong.
 */

/**
 * BAY MUC, va chung KHONG phai bay cai ten cho mot thu.
 *
 * `disabled`             ban trien khai nay khong dung kenh do -> khong co gi de canh;
 * `configured`           cau hinh noi co kenh, nhung chua dang nhap duoc lan nao;
 * `authenticated`        da dang nhap, socket CHUA tung mo -> `login()` thanh cong khong co
 *                        nghia la phia NHAN da nghe duoc, va §7.1 chinh la khe ho do;
 * `connected`            socket mo, VA da co tin ve trong nguong -> khoe theo nghia manh nhat;
 * `connected_but_idle`   socket mo, nhung khong tin nao trong nguong -> day la o ma truoc kia bi
 *                        gop nham vao `connected`, va la ca ly do tep nay ton tai;
 * `reconnecting`         socket dong, va DA CO mot lan thu noi lai duoc hen gio;
 * `disconnected`         socket dong, va KHONG co lan thu nao duoc hen -> trang thai 44 gio.
 */
export type ListenerPhase =
  | 'disabled'
  | 'configured'
  | 'authenticated'
  | 'connected'
  | 'connected_but_idle'
  | 'reconnecting'
  | 'disconnected';

export interface ChannelInboundHealth {
  readonly channel: string;
  readonly lastInboundAt: string | null;
  readonly lastInboundAgeSeconds: number | null;
  readonly inboundCount: number;
}

export interface ListenerHealth {
  readonly phase: ListenerPhase;
  /** `true` = socket dang mo theo hieu biet cua tien trinh nay. */
  readonly socketOpen: boolean;
  readonly connectedAt: string | null;
  readonly lastDisconnectedAt: string | null;
  readonly lastReconnectAt: string | null;
  readonly reconnectCount: number;
  /** Ma dong gan nhat cua socket. `1000` = NORMAL_CLOSURE, tuc dong "binh thuong" — xem §7.1. */
  readonly lastCloseCode: number | null;
  readonly lastCloseReason: string | null;
}

export interface ChannelHealth {
  readonly listener: ListenerHealth;
  readonly inbound: readonly ChannelInboundHealth[];
  /** Tu luc nao tien trinh nay bat dau nhin. Moi con so tren deu chi co nghia trong khoang do. */
  readonly observedSince: string;
  /** Nguong dang ap de goi mot kenh la "idle". */
  readonly idleThresholdSeconds: number;
}

/** Kenh DOC CHINH cua GD1 — kenh ma §7.1 noi toi, va la kenh phase cua listener bam theo. */
export const PRIMARY_INBOUND_CHANNEL = 'zca_listener';

/** Sau mot gio khong co tin nao thi dang de y — voi 10-20 don/ngay, do la mot khoang that su lang. */
const DEFAULT_IDLE_THRESHOLD_SECONDS = 3_600;

export interface ListenerObservation {
  readonly enabled: boolean;
  readonly authenticated: boolean;
  readonly socketOpen: boolean;
  readonly reconnectPending: boolean;
  readonly everConnected: boolean;
  readonly lastInboundAgeSeconds: number | null;
  readonly idleThresholdSeconds: number;
}

/**
 * Ham THUAN, tach khoi dich vu de bay muc kia kiem duoc ma khong can dung mot socket that.
 *
 * THU TU CAC NHANH LA MOT PHAN CUA DINH NGHIA:
 * `reconnecting` phai duoc hoi TRUOC `disconnected`, vi ca hai deu co socket dong — cai phan biet
 * chung la CO HAY KHONG mot lan thu noi lai dang cho. Va do dung la khac biet giua "he thong
 * dang tu chua" voi "he thong dang nam im", tuc khac biet ma §7.1 can doc duoc.
 */
export function deriveListenerPhase(input: ListenerObservation): ListenerPhase {
  if (!input.enabled) return 'disabled';
  if (input.socketOpen) {
    // Chua thay tin nao (`null`) CUNG la idle: mot socket vua mo lai sau su co se o day cho toi
    // khi co tin dau tien, va noi "connected" luc do la noi qua nhung gi ta biet.
    const idle =
      input.lastInboundAgeSeconds === null ||
      input.lastInboundAgeSeconds >= input.idleThresholdSeconds;
    return idle ? 'connected_but_idle' : 'connected';
  }
  if (input.reconnectPending) return 'reconnecting';
  if (input.everConnected) return 'disconnected';
  if (input.authenticated) return 'authenticated';
  return 'configured';
}

/**
 * NOI GIU quan sat. Mot the hien duy nhat cho ca tien trinh (dang ky o `ChannelsModule`).
 *
 * BAT BIEN: khong phuong thuc nao duoc phep nem. Day la tang QUAN SAT — no khong duoc lam roi
 * mot tin nhan, dung nhu `TelemetryService` khong duoc lam roi mot don hang.
 */
@Injectable()
export class ChannelHealthService {
  private readonly startedAt = new Date();
  private enabled = false;
  private authenticated = false;
  private socketOpen = false;
  private reconnectPending = false;
  private everConnected = false;
  private connectedAt: Date | null = null;
  private lastDisconnectedAt: Date | null = null;
  private lastReconnectAt: Date | null = null;
  private reconnectCount = 0;
  private lastCloseCode: number | null = null;
  private lastCloseReason: string | null = null;
  private readonly inbound = new Map<string, { at: Date; count: number }>();
  /**
   * NGUONG doc tu moi truong, KHONG phai tham so constructor.
   *
   * Da tung la tham so, va Nest lam do ngay bai boot dau tien: mot tham so kieu `number` bien
   * thanh mot phu thuoc ten `Number` ma khong container nao cung cap duoc, nen CA `AppModule`
   * khong dung len. Mot lop `@Injectable()` khong duoc co tham so vo huong — ke ca khi no co gia
   * tri mac dinh.
   */
  private readonly idleThresholdSeconds = readIdleThresholdSeconds();

  /** Ban trien khai nay CO dung kenh doc hay khong. Goi mot lan luc khoi dong. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** `login()` thanh cong. CHUA phai `connected` — xem chu thich cua `authenticated` o tren. */
  markAuthenticated(): void {
    this.authenticated = true;
  }

  markConnected(now: Date = new Date()): void {
    this.socketOpen = true;
    this.reconnectPending = false;
    this.connectedAt = now;
    if (this.everConnected) {
      // Lan mo socket THU HAI tro di la mot lan noi lai — dem no. Con so nay la thu phan biet
      // "mot socket on dinh" voi "mot socket cu vai phut lai dut roi tu chua".
      this.reconnectCount += 1;
      this.lastReconnectAt = now;
    }
    this.everConnected = true;
  }

  markClosed(code: number | null, reason: string | null, now: Date = new Date()): void {
    this.socketOpen = false;
    this.lastDisconnectedAt = now;
    this.lastCloseCode = code;
    this.lastCloseReason = reason;
  }

  /** Da hen gio mot lan thu noi lai. Tach khoi `markClosed` vi hai viec do that su tach nhau. */
  markReconnectScheduled(): void {
    this.reconnectPending = true;
  }

  markReconnectAbandoned(): void {
    this.reconnectPending = false;
  }

  /** Mot tin DA VE tren mot kenh. Goi o cong vao cua tung kenh, khong o giua duong. */
  recordInbound(channel: string, now: Date = new Date()): void {
    const existing = this.inbound.get(channel);
    this.inbound.set(channel, { at: now, count: (existing?.count ?? 0) + 1 });
  }

  snapshot(now: Date = new Date()): ChannelHealth {
    const primary = this.inbound.get(PRIMARY_INBOUND_CHANNEL) ?? null;
    const lastInboundAgeSeconds = primary ? ageSeconds(primary.at, now) : null;

    return {
      listener: {
        phase: deriveListenerPhase({
          enabled: this.enabled,
          authenticated: this.authenticated,
          socketOpen: this.socketOpen,
          reconnectPending: this.reconnectPending,
          everConnected: this.everConnected,
          lastInboundAgeSeconds,
          idleThresholdSeconds: this.idleThresholdSeconds,
        }),
        socketOpen: this.socketOpen,
        connectedAt: iso(this.connectedAt),
        lastDisconnectedAt: iso(this.lastDisconnectedAt),
        lastReconnectAt: iso(this.lastReconnectAt),
        reconnectCount: this.reconnectCount,
        lastCloseCode: this.lastCloseCode,
        lastCloseReason: this.lastCloseReason,
      },
      inbound: [...this.inbound.entries()]
        .map(([channel, seen]) => ({
          channel,
          lastInboundAt: seen.at.toISOString(),
          lastInboundAgeSeconds: ageSeconds(seen.at, now),
          inboundCount: seen.count,
        }))
        .sort((a, b) => a.channel.localeCompare(b.channel)),
      observedSince: this.startedAt.toISOString(),
      idleThresholdSeconds: this.idleThresholdSeconds,
    };
  }
}

/** `CHANNEL_IDLE_THRESHOLD_SECONDS` — de van hanh chinh duoc ma khong phai phat hanh lai. */
function readIdleThresholdSeconds(): number {
  const parsed = Number(process.env.CHANNEL_IDLE_THRESHOLD_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_THRESHOLD_SECONDS;
}

function ageSeconds(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
