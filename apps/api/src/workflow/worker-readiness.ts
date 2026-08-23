/**
 * VONG DOI CUA TIEN TRINH WORKER — logic THUAN: khong Nest, khong Hatchet, khong HTTP, khong I/O.
 *
 * File nay tra loi mot cau hoi VAN HANH: "container nay da nhan viec duoc chua, va neu chua thi
 * vi sao". `worker-health.server.ts` chi dich cau tra loi do sang ma HTTP; `workflow-worker.
 * service.ts` chi bao cho no biet chuyen gi vua xay ra. Tach ba viec do ra la co y — mot may
 * trang thai thuan kiem duoc bang dong ho gia, con mot healthcheck gan chat vao SDK thi khong.
 *
 * ---------------------------------------------------------------------------
 * HAI CAU HOI KHAC NHAU, va gop chung lai la sai lam pho bien nhat o tang nay:
 *
 *   live   "tien trinh nay con dang lam viec khong, hay phai giet no di?"
 *   ready  "co duoc GIAO VIEC MOI cho no khong?"
 *
 * Mot worker mat ket noi toi engine tra loi KHONG cho cau thu hai va CO cho cau thu nhat. Neu
 * chi co mot co, ta buoc phai chon: hoac giet no (bao restart moi lan engine khoi dong lai),
 * hoac bao no khoe (che do hong "container xanh, run treo mai mai" cua ban giao §29).
 *
 * ---------------------------------------------------------------------------
 * DUY NHAT MOT DUONG cho `live=false` khi tien trinh chua bi dung: FATAL.
 *
 * Do la nhung hong hoc ma THU LAI KHONG BAO GIO CUU DUOC — token sai, phien ban khuon khong ton
 * tai. Mot tien trinh kien tri thu lai mot cau hinh sai chinh la che do hong ta dang chan, chi
 * khac la no doi lot kien tri. Thoat khac 0 lam no lo ra ngay luc deploy.
 */

export const WORKER_LIFECYCLE_STATES = [
  /** Tien trinh vua len, chua thu ket noi gi. */
  'STARTING',
  /** Dang mo ket noi toi engine. */
  'CONNECTING',
  /** Da noi duoc; dang cho engine xac nhan da dang ky khuon mang phien ban. */
  'REGISTERING',
  /** Engine DA BIET worker nay phuc vu action nao. Chi o day moi duoc nhan viec. */
  'READY',
  /** Mat ket noi SAU khi da tung READY, hoac chua bao gio noi duoc. Co the tu phuc hoi. */
  'DEGRADED',
  /** Da nhan SIGTERM; dang rut. Khong nhan viec moi nua. */
  'DRAINING',
  'STOPPED',
] as const;

export type WorkerLifecycleState = (typeof WORKER_LIFECYCLE_STATES)[number];

/**
 * VI SAO KHONG READY — co kieu, khong phai chuoi tu do.
 *
 * Mot cong nghiep vu co N duong tu choi phai phan biet duoc N ly do (quy tac observability cua
 * repo). O day N=5, va ca nam deu dan toi mot viec phai lam KHAC NHAU:
 *
 *   CONNECTING          doi — hoac engine chua len
 *   REGISTERING         doi — engine da len, dang dang ky (co the toi 38 s, xem §29)
 *   ENGINE_UNREACHABLE  DI XEM ENGINE, khong phai xem worker
 *   DRAINING            binh thuong, deploy dang chay
 *   STOPPED             tien trinh da dung
 */
export const WORKER_NOT_READY_REASONS = [
  'NOT_STARTED',
  'CONNECTING',
  'REGISTERING',
  'ENGINE_UNREACHABLE',
  'DRAINING',
  'STOPPED',
] as const;

export type WorkerNotReadyReason = (typeof WORKER_NOT_READY_REASONS)[number];

/** Hong hoc ma THU LAI khong cuu duoc. Moi ma o day phai dan toi mot lan thoat khac 0. */
export const WORKER_FATAL_REASONS = [
  /** Bien moi truong / goi khach sai — phat hien luc boot hoac luc dang ky. */
  'CONFIG_INVALID',
  /** Engine tu choi danh tinh: token sai, het han, sai tenant. */
  'ENGINE_AUTH_REJECTED',
  /** Engine tu choi chinh khuon (ten sai quy tac, phien ban khong dung duoc). */
  'REGISTRATION_REJECTED',
] as const;

export type WorkerFatalReason = (typeof WORKER_FATAL_REASONS)[number];

export const WORKER_NOT_READY_LABELS: Record<WorkerNotReadyReason, string> = {
  NOT_STARTED: 'Tiến trình vừa lên, chưa bắt đầu kết nối',
  CONNECTING: 'Đang mở kết nối tới engine',
  REGISTERING: 'Đang chờ engine xác nhận đã đăng ký khuôn',
  ENGINE_UNREACHABLE: 'Mất kết nối tới engine quá thời gian ân hạn — đi xem ENGINE',
  DRAINING: 'Đang rút worker (SIGTERM)',
  STOPPED: 'Tiến trình đã dừng',
};

export const WORKER_FATAL_LABELS: Record<WorkerFatalReason, string> = {
  CONFIG_INVALID: 'Cấu hình worker không hợp lệ — sửa biến môi trường rồi deploy lại',
  ENGINE_AUTH_REJECTED: 'Engine từ chối token — xoay lại bí mật rồi deploy lại',
  REGISTRATION_REJECTED: 'Engine từ chối khuôn workflow — sai tên hoặc sai phiên bản',
};

/**
 * AN HAN cho DEGRADED sau khi da tung READY.
 *
 * 30 s xuat phat tu mot phep do, khong tu cam giac: W5 (`workflow-recovery.int.spec.ts`) da
 * `docker stop` roi `docker start` engine that va do lai — mot vong khoi dong lai engine nam
 * gon trong khoang nay. Ngan hon thi moi lan nang cap engine deu lam ca dan worker do
 * healthcheck; dai hon thi mot engine chet that su bi giau qua lau.
 */
export const WORKER_DEGRADED_GRACE_MS = 30_000;

/**
 * CHUYEN TRANG THAI HOP LE. Bang nay la hop dong, khong phai goi y.
 *
 * Nhay coc bi NEM co chu dich: neu `ready()` goi duoc tu `STARTING` thi mot ban refactor lo tay
 * se bao READY ma chua he dang ky, va khong bai test nao con bat duoc. Bat bien "khong bao READY
 * khi chua dang ky" phai co RANG o dau do — o day la cho do.
 */
const ALLOWED: Record<WorkerLifecycleState, readonly WorkerLifecycleState[]> = {
  STARTING: ['CONNECTING', 'DRAINING'],
  CONNECTING: ['REGISTERING', 'DEGRADED', 'DRAINING'],
  REGISTERING: ['READY', 'DEGRADED', 'DRAINING'],
  READY: ['DEGRADED', 'DRAINING'],
  // DEGRADED -> READY thang: SDK tu noi lai duoc ma khong phai dang ky lai tu dau.
  // DEGRADED -> CONNECTING: vong THU LAI cua `startWithRetry()` mo lai ket noi tu dau. Thieu
  //   duong nay thi lan thu thu hai se nem `WORKER_STATE_TRANSITION_INVALID` — tuc la mot bien
  //   phap an toan lai tro thanh chinh cho hong.
  // DEGRADED -> REGISTERING: da noi lai duoc, dang dang ky lai.
  DEGRADED: ['CONNECTING', 'REGISTERING', 'READY', 'DRAINING'],
  DRAINING: ['STOPPED'],
  STOPPED: [],
};

export interface WorkerHealthSnapshot {
  readonly state: WorkerLifecycleState;
  /** Co duoc giao viec moi khong. */
  readonly ready: boolean;
  /** Tien trinh con dang lam viec khong. `false` => container nen thoat khac 0. */
  readonly live: boolean;
  readonly reason: WorkerNotReadyReason | WorkerFatalReason | null;
  /** Nhan tieng Viet cho nguoi doc log; `null` khi dang READY. */
  readonly label: string | null;
  /** Thoi gian tu luc bat dau dang ky toi luc engine xac nhan. `null` khi chua xong. */
  readonly registrationMs: number | null;
  /** Da mat ket noi bao lau. `null` khi khong o DEGRADED. */
  readonly degradedForMs: number | null;
  readonly fatal: { readonly reason: WorkerFatalReason; readonly detail: string } | null;
}

export interface WorkerReadinessOptions {
  /** Tiem dong ho de test dieu khien duoc thoi gian; mac dinh `Date.now`. */
  readonly now?: () => number;
  readonly degradedGraceMs?: number;
}

export class WorkerReadiness {
  private current: WorkerLifecycleState = 'STARTING';
  private readonly trail: WorkerLifecycleState[] = ['STARTING'];
  private readonly now: () => number;
  private readonly graceMs: number;

  private registeringStartedAt: number | null = null;
  private registrationDurationMs: number | null = null;
  private degradedSince: number | null = null;
  private fatalCause: { reason: WorkerFatalReason; detail: string } | null = null;

  constructor(options: WorkerReadinessOptions = {}) {
    this.now = options.now ?? Date.now;
    this.graceMs = options.degradedGraceMs ?? WORKER_DEGRADED_GRACE_MS;
  }

  get state(): WorkerLifecycleState {
    return this.current;
  }

  /** Duong da di qua. Doc duoc tu ngoai de test khang dinh KHONG buoc nao bi bo qua. */
  get history(): readonly WorkerLifecycleState[] {
    return this.trail;
  }

  connecting(): void {
    this.transition('CONNECTING');
  }

  registering(): void {
    this.transition('REGISTERING');
    // Bam gio o day chu khong o `connecting()`: cai ta muon do — va cai `start_period` cua
    // compose can — la thoi gian ENGINE XAC NHAN KHUON, khong phai thoi gian bat tay TCP.
    this.registeringStartedAt = this.now();
  }

  ready(): void {
    const from = this.current;
    this.transition('READY');
    if (from === 'REGISTERING' && this.registeringStartedAt !== null) {
      this.registrationDurationMs = this.now() - this.registeringStartedAt;
    }
    this.degradedSince = null;
  }

  /**
   * Mat ket noi. KHONG phai loi chet nguoi: engine khoi dong lai la chuyen binh thuong, va W5
   * da do duoc rang viec khong bi mat khi dieu do xay ra.
   */
  degraded(): void {
    if (this.current === 'DEGRADED') return; // giu nguyen moc thoi gian: mat 2 phut la 2 phut
    this.transition('DEGRADED');
    this.degradedSince = this.now();
  }

  draining(): void {
    this.transition('DRAINING');
  }

  stopped(): void {
    this.transition('STOPPED');
  }

  /**
   * Hong khong cuu duoc. KHONG di qua bang `ALLOWED` — mot hong hoc chet nguoi nhan duoc o BAT
   * KY dau, va chan no lai vi "sai thu tu" thi ta danh mat chinh thong tin can nhat.
   */
  fatal(reason: WorkerFatalReason, detail: string): void {
    this.fatalCause = { reason, detail };
  }

  snapshot(): WorkerHealthSnapshot {
    if (this.fatalCause) {
      return {
        state: this.current,
        ready: false,
        live: false,
        reason: this.fatalCause.reason,
        label: WORKER_FATAL_LABELS[this.fatalCause.reason],
        registrationMs: this.registrationDurationMs,
        degradedForMs: this.degradedFor(),
        fatal: this.fatalCause,
      };
    }

    const reason = this.notReadyReason();
    return {
      state: this.current,
      ready: reason === null,
      live: this.current !== 'STOPPED',
      reason,
      label: reason === null ? null : WORKER_NOT_READY_LABELS[reason],
      registrationMs: this.registrationDurationMs,
      degradedForMs: this.degradedFor(),
      fatal: null,
    };
  }

  private notReadyReason(): WorkerNotReadyReason | null {
    switch (this.current) {
      case 'STARTING':
        return 'NOT_STARTED';
      case 'CONNECTING':
        return 'CONNECTING';
      case 'REGISTERING':
        return 'REGISTERING';
      case 'READY':
        return null;
      case 'DEGRADED': {
        // TRONG an han van bao ready: mot nhip mang chop hoac mot lan nang cap engine khong duoc
        // lam rot ca dan worker. QUA an han thi thoi — luc do no la mot su co that, va giau no
        // di chinh la che do hong §29.
        const forMs = this.degradedFor();
        return forMs !== null && forMs < this.graceMs ? null : 'ENGINE_UNREACHABLE';
      }
      // DRAINING KHONG co an han: ta dang CO Y rut, va moi viec giao them luc nay la viec se bi
      // bo do. Het ready ngay lap tuc la cach duy nhat de engine ngung dinh tuyen viec toi day.
      case 'DRAINING':
        return 'DRAINING';
      case 'STOPPED':
        return 'STOPPED';
    }
  }

  private degradedFor(): number | null {
    if (this.current !== 'DEGRADED' || this.degradedSince === null) return null;
    return this.now() - this.degradedSince;
  }

  private transition(to: WorkerLifecycleState): void {
    if (this.fatalCause) {
      throw new Error(
        `WORKER_STATE_TRANSITION_INVALID: ${this.current} -> ${to} bi chan vi tien trinh dang o ` +
          `trang thai hong khong cuu duoc (${this.fatalCause.reason}). Sua cau hinh roi deploy lai.`,
      );
    }
    if (!ALLOWED[this.current].includes(to)) {
      throw new Error(
        `WORKER_STATE_TRANSITION_INVALID: ${this.current} -> ${to}. Duong hop le tu ` +
          `${this.current}: ${ALLOWED[this.current].join(', ') || '(khong con duong nao)'}.`,
      );
    }
    this.current = to;
    this.trail.push(to);
  }
}
