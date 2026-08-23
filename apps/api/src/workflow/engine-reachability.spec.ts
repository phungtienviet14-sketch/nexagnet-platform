import { describe, expect, it, vi } from 'vitest';
import { EngineReachabilityMonitor, parseHostPort } from './engine-reachability.js';
import { WorkerReadiness } from './worker-readiness.js';

/**
 * DO "ENGINE CON SONG KHONG" — va CHI dieu do.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI CO BO DO NAY. Khong co no thi che do hong nay khong ai thay:
 *
 *   worker READY -> engine chet -> SDK lang le thu noi lai -> `/ready` VAN 200
 *
 * Container xanh, healthcheck xanh, va moi run nam cho. Dung ban giao §29 goi ten.
 *
 * ---------------------------------------------------------------------------
 * VI SAO DO BANG TCP TOI CONG gRPC — va day la mot bai hoc da tra gia (ban giao §25 bay #2):
 *
 * Phep do song/chet phien truoc dung `runs.list` cua SDK. Loi goi do di qua REST cua container
 * DASHBOARD, nen `docker stop hatchet-engine` KHONG lam no im — bo do bao engine con song trong
 * khi engine da chet. Mot phep do di nham cua la mot phep do sai.
 *
 * GIOI HAN PHAI NOI RO, khong duoc giau: TCP mo duoc chi chung minh CO AI DO dang nghe o cong
 * do. No KHONG chung minh dang ky cua worker con hieu luc. Day la xap xi co chu dich — no bat
 * duoc "engine chet/khoi dong lai", la che do hong da do duoc (W5), chu khong bat duoc "engine
 * song nhung da quen worker nay".
 */

function monitorWith(probeResults: boolean[]) {
  const readiness = new WorkerReadiness();
  const probe = vi.fn<() => Promise<boolean>>();
  for (const result of probeResults) probe.mockResolvedValueOnce(result);
  probe.mockResolvedValue(probeResults[probeResults.length - 1] ?? true);

  const monitor = new EngineReachabilityMonitor({
    hostPort: 'hatchet-engine:7070',
    readiness,
    probe,
    intervalMs: 1_000,
  });
  return { readiness, probe, monitor };
}

describe('parseHostPort', () => {
  it('tach duoc dang host:port thuong dung cua compose', () => {
    expect(parseHostPort('hatchet-engine:7070')).toEqual({ host: 'hatchet-engine', port: 7070 });
    expect(parseHostPort('localhost:7744')).toEqual({ host: 'localhost', port: 7744 });
  });

  it('NEM voi chuoi khong mang cong — mot bien dat nham phai lo ra ngay', () => {
    // `WORKFLOW_ENGINE_HOST_PORT=hatchet-engine` (quen cong) la loi cau hinh de mac nhat, va no
    // phai chet o day chu khong bien thanh mot bo do luon bao "khong toi duoc".
    expect(() => parseHostPort('hatchet-engine')).toThrow(/WORKFLOW_ENGINE_HOST_PORT/);
    expect(() => parseHostPort('')).toThrow(/WORKFLOW_ENGINE_HOST_PORT/);
  });
});

describe('EngineReachabilityMonitor', () => {
  it('engine chet sau khi READY -> chuyen DEGRADED', async () => {
    const { readiness, monitor } = monitorWith([false]);
    readiness.connecting();
    readiness.registering();
    readiness.ready();

    await monitor.tick();

    expect(readiness.state).toBe('DEGRADED');
  });

  it('engine ve -> tro lai READY ma KHONG khoi dong lai tien trinh', async () => {
    const { readiness, monitor } = monitorWith([false, true]);
    readiness.connecting();
    readiness.registering();
    readiness.ready();

    await monitor.tick(); // chet
    expect(readiness.state).toBe('DEGRADED');

    await monitor.tick(); // song lai
    // Day la ca ly do bo do nay ton tai: phuc hoi phai TU DONG. Bat nguoi truc phai `docker
    // restart` worker moi lan nang cap engine la mot quy trinh se bi quen.
    expect(readiness.state).toBe('READY');
  });

  it('engine van song -> khong dong gi ca, khong sinh chuyen trang thai rac', async () => {
    const { readiness, monitor } = monitorWith([true, true, true]);
    readiness.connecting();
    readiness.registering();
    readiness.ready();
    const before = readiness.history.length;

    await monitor.tick();
    await monitor.tick();
    await monitor.tick();

    expect(readiness.state).toBe('READY');
    expect(readiness.history.length).toBe(before);
  });

  it('KHONG dong gi khi dang DRAINING — rut worker khong duoc bi bo do keo nguoc', async () => {
    const { readiness, monitor, probe } = monitorWith([false]);
    readiness.connecting();
    readiness.registering();
    readiness.ready();
    readiness.draining();

    await monitor.tick();

    // `DEGRADED` tu `DRAINING` la mot chuyen trang thai bat hop le va se NEM. Bo do phai biet
    // dung lai, chu khong phai de may trang thai chan no bang mot ngoai le trong timer.
    expect(readiness.state).toBe('DRAINING');
    expect(probe).not.toHaveBeenCalled();
  });

  it('KHONG dong gi truoc khi tung READY — luc do `start()` dang lo, khong phai bo do', async () => {
    const { readiness, monitor, probe } = monitorWith([false]);
    readiness.connecting();
    readiness.registering();

    await monitor.tick();

    // Trong luc dang dang ky, "chua toi duoc engine" la trang thai BINH THUONG va `start()` dang
    // xu ly no. Cho bo do xen vao day se lam hai duong cung ghi mot trang thai.
    expect(readiness.state).toBe('REGISTERING');
    expect(probe).not.toHaveBeenCalled();
  });

  it('bo do NEM thi coi nhu khong toi duoc, khong lam sap timer', async () => {
    const readiness = new WorkerReadiness();
    const probe = vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error('EHOSTUNREACH'));
    const monitor = new EngineReachabilityMonitor({
      hostPort: 'hatchet-engine:7070',
      readiness,
      probe,
      intervalMs: 1_000,
    });
    readiness.connecting();
    readiness.registering();
    readiness.ready();

    await expect(monitor.tick()).resolves.toBeUndefined();
    expect(readiness.state).toBe('DEGRADED');
  });

  it('stop() go timer — tien trinh thoat duoc sau khi rut', () => {
    const { monitor } = monitorWith([true]);
    monitor.start();
    expect(() => monitor.stop()).not.toThrow();
    expect(() => monitor.stop()).not.toThrow(); // goi hai lan van an toan
  });
});
