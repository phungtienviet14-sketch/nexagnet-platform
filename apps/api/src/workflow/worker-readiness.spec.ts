import { describe, expect, it } from 'vitest';
import {
  WORKER_DEGRADED_GRACE_MS,
  WorkerReadiness,
  type WorkerLifecycleState,
} from './worker-readiness.js';

/**
 * READINESS CUA TIEN TRINH WORKER — mien nay tra loi DUNG MOT cau:
 *
 *   "Tien trinh nay da co the NHAN VIEC chua?"
 *
 * va no phai tra loi bang TRANG THAI DO DUOC, khong phai bang mot con so `sleep`.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG TIMER LAM READINESS. Day la so do THAT, khong phai lo ngai ly thuyet
 * (ban giao §29 — bon lan do thoi gian dang ky worker tren engine that):
 *
 *     22/08 engine nguoi          ~38   s
 *     22/08 engine am             ~12   s
 *     23/08 engine chay 9 gio      6,3  s   roi   30,1 s
 *
 * Bien dong 6x giua hai lan do LIEN TIEP tren cung mot engine. Bat ky hang so `sleep` nao cung
 * sai theo mot trong hai chieu: dat thap thi bao READY khi chua dang ky xong, dat cao thi keo
 * dai moi lan deploy vo co. `start_period: 90s` cua compose la BIEN AN TOAN cho healthcheck,
 * KHONG phai dinh nghia cua readiness.
 *
 * ---------------------------------------------------------------------------
 * CHE DO HONG TE NHAT ma ca file nay ton tai de chan (ban giao §29):
 *
 *   container XANH + healthcheck XANH + moi run nam QUEUED vinh vien.
 *
 * Mot worker song ma chua dang ky doc ra giong het mot worker khoe. Nen `ready` o day KHONG
 * BAO GIO duoc suy ra tu "tien trinh con song".
 */

/** Dong ho gia — moi bai tu dieu khien thoi gian, khong bai nao cho doi that. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

function readiness(graceMs?: number) {
  const clock = fakeClock();
  const subject = new WorkerReadiness({
    now: clock.now,
    ...(graceMs === undefined ? {} : { degradedGraceMs: graceMs }),
  });
  return { clock, subject };
}

describe('WorkerReadiness — duong di binh thuong', () => {
  it('cold start: di qua DU bon trang thai va chi READY o cuoi', () => {
    const { subject } = readiness();

    // STARTING la trang thai luc tien trinh vua len: chua thu ket noi gi ca.
    expect(subject.state).toBe<WorkerLifecycleState>('STARTING');
    expect(subject.snapshot().ready).toBe(false);
    expect(subject.snapshot().reason).toBe('NOT_STARTED');

    subject.connecting();
    expect(subject.state).toBe<WorkerLifecycleState>('CONNECTING');
    expect(subject.snapshot().ready).toBe(false);
    expect(subject.snapshot().reason).toBe('CONNECTING');

    subject.registering();
    expect(subject.state).toBe<WorkerLifecycleState>('REGISTERING');
    expect(subject.snapshot().ready).toBe(false);
    // Phan biet CONNECTING voi REGISTERING la co y: "chua noi duoc toi engine" va "da noi duoc,
    // dang cho engine xac nhan khuon" la hai viec phai lam khac nhau khi truc dem.
    expect(subject.snapshot().reason).toBe('REGISTERING');

    subject.ready();
    expect(subject.state).toBe<WorkerLifecycleState>('READY');
    expect(subject.snapshot().ready).toBe(true);
    expect(subject.snapshot().reason).toBeNull();
  });

  it('warm start: nhanh hon nhung KHONG duoc bo qua trang thai nao', () => {
    const { clock, subject } = readiness();

    subject.connecting();
    clock.advance(200);
    subject.registering();
    clock.advance(6_300); // lan do nhanh nhat da ghi duoc: 6,3 s
    subject.ready();

    expect(subject.history).toEqual<WorkerLifecycleState[]>([
      'STARTING',
      'CONNECTING',
      'REGISTERING',
      'READY',
    ]);
  });

  it('nhay thang toi READY bi NEM — mot buoc bi bo qua la mot phep do bi mat', () => {
    const { subject } = readiness();
    // Neu cho phep nhay coc thi mot ban refactor lo tay se bao READY ma chua he dang ky, va
    // KHONG bai test nao con bat duoc. Chan o day de cai gia phai tra la mot bai test do.
    expect(() => subject.ready()).toThrow(/WORKER_STATE_TRANSITION_INVALID/);
    expect(() => subject.registering()).toThrow(/WORKER_STATE_TRANSITION_INVALID/);
  });

  it('do THOI GIAN DANG KY that, de compose lay so do chu khong doan', () => {
    const { clock, subject } = readiness();

    subject.connecting();
    subject.registering();
    clock.advance(30_100); // lan do 23/08
    expect(subject.snapshot().registrationMs).toBeNull(); // chua xong thi chua co so

    subject.ready();
    expect(subject.snapshot().registrationMs).toBe(30_100);
  });
});

describe('WorkerReadiness — engine chua len / khong co', () => {
  it('dang ky CHAM hon 30 s van khong tu bo cuoc va khong tu bao READY', () => {
    const { clock, subject } = readiness();

    subject.connecting();
    subject.registering();
    // 45 s — dai hon MOI lan do da ghi (38 s la ten nhat). Khong duoc co hang so nao ben trong
    // bien no thanh READY hay thanh FATAL: engine nguoi that su lau nhu vay.
    clock.advance(45_000);

    expect(subject.state).toBe<WorkerLifecycleState>('REGISTERING');
    expect(subject.snapshot().ready).toBe(false);
    expect(subject.snapshot().live).toBe(true);
    expect(subject.snapshot().fatal).toBeNull();
  });

  it('engine KHONG CO: khong ready mai mai, nhung tien trinh van SONG', () => {
    const { clock, subject } = readiness();

    subject.connecting();
    subject.degraded(); // khong mo duoc ket noi
    clock.advance(10 * 60_000);

    expect(subject.snapshot().ready).toBe(false);
    expect(subject.snapshot().reason).toBe('ENGINE_UNREACHABLE');
    // SONG chu khong READY. Thoat tien trinh o day chi doi mot engine dang len thanh mot con
    // bao restart, ma khong lam engine len nhanh hon mot giay nao.
    expect(subject.snapshot().live).toBe(true);
  });
});

describe('WorkerReadiness — mat engine SAU khi da READY', () => {
  it('trong thoi gian an han: van bao READY, de mot nhip mang chop khong lam rot worker', () => {
    const { clock, subject } = readiness();
    subject.connecting();
    subject.registering();
    subject.ready();

    subject.degraded();
    clock.advance(WORKER_DEGRADED_GRACE_MS - 1);

    // Da tung READY thi mot lan mat ket noi ngan KHONG duoc lam healthcheck do ngay: engine
    // khoi dong lai la chuyen binh thuong (W5 da do: chet roi len lai KHONG mat viec).
    expect(subject.snapshot().ready).toBe(true);
    expect(subject.state).toBe<WorkerLifecycleState>('DEGRADED');
  });

  it('qua han an han: KHONG ready nua — nhung VAN KHONG chet', () => {
    const { clock, subject } = readiness();
    subject.connecting();
    subject.registering();
    subject.ready();

    subject.degraded();
    clock.advance(WORKER_DEGRADED_GRACE_MS + 1);

    expect(subject.snapshot().ready).toBe(false);
    expect(subject.snapshot().reason).toBe('ENGINE_UNREACHABLE');
    // HAI KHANG DINH NAY LA CA THIET KE:
    //   ready=false  -> `docker ps` hien `unhealthy`, nguoi truc THAY duoc.
    //   live=true    -> tien trinh khong thoat, nen `restart: always` khong dap lai.
    // Compose KHONG tu restart container unhealthy (khac Kubernetes), nen cap gia tri nay cho
    // ra "hong nhin thay duoc" ma khong cho ra "bao restart".
    expect(subject.snapshot().live).toBe(true);
    expect(subject.snapshot().degradedForMs).toBe(WORKER_DEGRADED_GRACE_MS + 1);
  });

  it('thu lai duoc tu DEGRADED: mo lai ket noi tu dau nhieu lan lien tiep', () => {
    const { subject } = readiness();
    subject.connecting();
    subject.degraded(); // engine chua len

    // Vong thu lai cua `startWithRetry()` di lai duong nay moi lan. Neu may trang thai chan no,
    // thi lan thu THU HAI se nem — va bien phap an toan tro thanh chinh cho hong.
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(() => subject.connecting()).not.toThrow();
      expect(() => subject.degraded()).not.toThrow();
    }

    subject.connecting();
    subject.registering();
    subject.ready();
    expect(subject.snapshot().ready).toBe(true);
  });

  it('phuc hoi: engine ve thi worker ve READY, khong can khoi dong lai tien trinh', () => {
    const { clock, subject } = readiness();
    subject.connecting();
    subject.registering();
    subject.ready();

    subject.degraded();
    clock.advance(WORKER_DEGRADED_GRACE_MS * 3);
    expect(subject.snapshot().ready).toBe(false);

    subject.ready();
    expect(subject.state).toBe<WorkerLifecycleState>('READY');
    expect(subject.snapshot().ready).toBe(true);
    expect(subject.snapshot().degradedForMs).toBeNull();
  });
});

describe('WorkerReadiness — hong vi CAU HINH thi phai chet han', () => {
  it('token bi tu choi: KHONG ready, KHONG live — de container thoat khac 0', () => {
    const { clock, subject } = readiness();
    subject.connecting();
    subject.fatal('ENGINE_AUTH_REJECTED', 'engine tu choi token');

    clock.advance(60_000);
    expect(subject.snapshot().ready).toBe(false);
    // Day la cho DUY NHAT `live` duoc phep false khi tien trinh chua bi dung: thu lai mai voi
    // mot token sai CHINH LA che do hong "container xanh, run treo mai mai". Mot lan thoat khac
    // 0 lam cau hinh sai lo ra ngay luc deploy.
    expect(subject.snapshot().live).toBe(false);
    expect(subject.snapshot().fatal).toEqual({
      reason: 'ENGINE_AUTH_REJECTED',
      detail: 'engine tu choi token',
    });
  });

  it('FATAL la ket cuc: khong duong nao bo qua no de ve READY', () => {
    const { subject } = readiness();
    subject.connecting();
    subject.fatal('CONFIG_INVALID', 'WORKFLOW_WORKER_VERSION khong hop le');
    expect(() => subject.ready()).toThrow(/WORKER_STATE_TRANSITION_INVALID/);
  });
});

describe('WorkerReadiness — rut worker', () => {
  it('SIGTERM: het ready NGAY, khong co an han — de engine ngung giao viec moi', () => {
    const { subject } = readiness();
    subject.connecting();
    subject.registering();
    subject.ready();

    subject.draining();
    // KHONG dung an han o day. An han danh cho "co the tu khoi phuc"; DRAINING thi khong —
    // ta DANG co y rut, va moi viec giao them vao luc nay la viec se bi bo do.
    expect(subject.snapshot().ready).toBe(false);
    expect(subject.snapshot().reason).toBe('DRAINING');
    expect(subject.snapshot().live).toBe(true);
  });

  it('rut xong: STOPPED thi khong con live', () => {
    const { subject } = readiness();
    subject.connecting();
    subject.registering();
    subject.ready();
    subject.draining();
    subject.stopped();

    expect(subject.state).toBe<WorkerLifecycleState>('STOPPED');
    expect(subject.snapshot().live).toBe(false);
    expect(subject.snapshot().ready).toBe(false);
  });

  it('DRAINING nhan duoc tu MOI trang thai — SIGTERM khong doi worker len xong', () => {
    for (const arrive of ['STARTING', 'CONNECTING', 'REGISTERING', 'DEGRADED'] as const) {
      const { subject } = readiness();
      if (arrive !== 'STARTING') subject.connecting();
      if (arrive === 'REGISTERING') subject.registering();
      if (arrive === 'DEGRADED') subject.degraded();

      expect(() => subject.draining()).not.toThrow();
      expect(subject.state).toBe<WorkerLifecycleState>('DRAINING');
    }
  });
});
