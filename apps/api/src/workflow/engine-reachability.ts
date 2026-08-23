import { Logger } from '@nestjs/common';
import { connect, type Socket } from 'node:net';
import type { WorkerReadiness } from './worker-readiness.js';

/**
 * BO DO "ENGINE CON SONG KHONG" cho tien trinh worker.
 *
 * ---------------------------------------------------------------------------
 * CHE DO HONG MA FILE NAY TON TAI DE DONG:
 *
 *   worker READY -> engine chet -> SDK lang le thu noi lai -> `/ready` VAN tra 200
 *
 * Container xanh, healthcheck xanh, moi run nam cho vinh vien. Ban giao §29 goi day la che do
 * hong TE NHAT cua ca he, va no khong tu lo ra: khong co ngoai le nao duoc nem, khong co dong
 * log nao do len.
 *
 * ---------------------------------------------------------------------------
 * VI SAO TCP CHU KHONG PHAI MOT LOI GOI SDK — bai hoc da tra gia, ban giao §25 bay #2:
 *
 * Phep do song/chet o phien truoc dung `runs.list`. Loi goi do di qua REST cua container
 * DASHBOARD, nen `docker stop hatchet-engine` KHONG lam no im: bo do bao "engine con song" trong
 * khi engine da chet. Mot phep do di NHAM CUA la mot phep do sai, khong phai mot phep do kem.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ GIOI HAN — noi ro de khong ai doc nham no thanh nhieu hon:
 *
 * TCP mo duoc chi chung minh CO AI DO dang nghe o cong do. No KHONG chung minh dang ky cua
 * worker con hieu luc phia engine. Day la mot xap xi CO CHU DICH:
 *
 *   BAT duoc:      engine chet / khoi dong lai / mang dut  (che do hong da do that o W5)
 *   KHONG bat duoc: engine song nhung da quen worker nay
 *
 * De bat duoc ca cai thu hai can mot tin hieu tu chinh SDK ve trang thai dang ky. SDK 1.28.2
 * khong phoi ra thu do qua mot be mat on dinh, nen khong lam. Ghi lai o day de lan sau ai do
 * nang SDK thi biet cho nay co the tot len.
 */

export interface HostPort {
  readonly host: string;
  readonly port: number;
}

/**
 * Tach `host:port`. NEM voi moi dang khac — khong co duong lui mac dinh.
 *
 * `WORKFLOW_ENGINE_HOST_PORT=hatchet-engine` (quen cong) la loi cau hinh de mac nhat o day, va
 * neu no khong nem thi bo do se im lang bao "khong toi duoc" mai mai — trieu chung se doc ra
 * giong het mot engine dang chet.
 */
export function parseHostPort(raw: string): HostPort {
  const value = raw?.trim() ?? '';
  const separator = value.lastIndexOf(':');
  const port = separator === -1 ? Number.NaN : Number(value.slice(separator + 1));
  const host = separator === -1 ? '' : value.slice(0, separator);

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(
      `WORKFLOW_ENGINE_HOST_PORT_INVALID: '${raw}' khong phai dang 'host:port'. ` +
        `Vi du dung: 'hatchet-engine:7070'.`,
    );
  }
  return { host, port };
}

/** Bo do that: mo mot ket noi TCP roi dong ngay. Khong gui byte nao. */
export function tcpProbe(target: HostPort, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const socket: Socket = connect({ host: target.host, port: target.port });
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** Nhip do mac dinh. 5 s trung nhip cua `WorkflowScheduler` — mot nhip de doc trong log. */
export const ENGINE_PROBE_INTERVAL_MS = 5_000;
export const ENGINE_PROBE_TIMEOUT_MS = 2_000;

export interface EngineReachabilityOptions {
  readonly hostPort: string;
  readonly readiness: WorkerReadiness;
  /** Tiem de test khong phai mo cong that. */
  readonly probe?: (target: HostPort, timeoutMs: number) => Promise<boolean>;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
}

export class EngineReachabilityMonitor {
  private readonly logger = new Logger(EngineReachabilityMonitor.name);
  private readonly target: HostPort;
  private readonly probe: (target: HostPort, timeoutMs: number) => Promise<boolean>;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly options: EngineReachabilityOptions) {
    this.target = parseHostPort(options.hostPort);
    this.probe = options.probe ?? tcpProbe;
    this.intervalMs = options.intervalMs ?? ENGINE_PROBE_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? ENGINE_PROBE_TIMEOUT_MS;
  }

  /** Khuon `WorkflowScheduler`: `setInterval` + `.unref()` + co `ticking`. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // `.unref()` de bo do KHONG mot minh giu tien trinh song. Cai giu tien trinh song la may chu
    // health (co y khong unref) va ban than worker.
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Mot nhip do. Xuat ra de test dieu khien duoc tung nhip thay vi cho dong ho that.
   *
   * KHONG BAO GIO NEM: mot ngoai le trong callback cua `setInterval` la mot ngoai le khong ai
   * bat, va no giet ca tien trinh worker vi mot lan do hong.
   */
  async tick(): Promise<void> {
    if (this.ticking) return;

    /**
     * CHI do khi da TUNG READY va chua rut.
     *
     * Truoc READY, `start()` cua service dang lo viec ket noi — cho bo do xen vao se co HAI
     * duong cung ghi mot may trang thai, va thu tu giua chung khong xac dinh duoc.
     * Tu DRAINING, `degraded()` la chuyen trang thai bat hop le va se NEM: bo do phai tu biet
     * dung, chu khong dua vao ngoai le de dung.
     */
    const state = this.options.readiness.state;
    if (state !== 'READY' && state !== 'DEGRADED') return;

    this.ticking = true;
    try {
      let reachable: boolean;
      try {
        reachable = await this.probe(this.target, this.timeoutMs);
      } catch {
        // Bo do nem = khong toi duoc. Gop hai truong hop nay lai la dung: ca hai deu co nghia
        // "khong xac nhan duoc engine dang nghe".
        reachable = false;
      }

      if (!reachable && state === 'READY') {
        this.logger.warn(
          `Mat ket noi toi engine ${this.target.host}:${this.target.port} — chuyen DEGRADED. ` +
            `Tien trinh KHONG thoat: engine khoi dong lai la chuyen binh thuong.`,
        );
        this.options.readiness.degraded();
        return;
      }

      if (reachable && state === 'DEGRADED') {
        this.logger.log(`Engine ${this.target.host}:${this.target.port} da tro lai — READY.`);
        this.options.readiness.ready();
      }
    } finally {
      this.ticking = false;
    }
  }
}
