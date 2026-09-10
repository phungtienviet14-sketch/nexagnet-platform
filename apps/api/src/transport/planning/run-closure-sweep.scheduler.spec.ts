import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransportPlanningPolicy } from './planning.types.js';
import {
  RUN_CLOSURE_SWEEP_SWITCH_ENV,
  RunClosureSweepScheduler,
  runClosureSweepEnabled,
} from './run-closure-sweep.scheduler.js';
import type { RunClosureService, RunClosureSweepResult } from './run-closure.service.js';

/**
 * BO LAP LICH CUA LUOT QUET (`#293` R3).
 *
 * Bai kiem o day KHONG kiem luan ly dong vong chay — cai do thuoc `run-closure.service.spec.ts`. No
 * kiem ba thu chi thuoc ve cai timer:
 *
 *   · cong tac van hanh tat duoc, va tat thi KHONG co timer nao duoc dung;
 *   · mot luot quet hong khong lam chet tien trinh, va khong lam chet luot quet ke tiep;
 *   · timer khong giu tien trinh song (`.unref()`).
 */

const policy = (intervalSeconds: number): TransportPlanningPolicy => ({
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [],
  closure: { idleHours: null },
  sweep: { intervalSeconds, batchSize: 50 },
});

const fakeService = (sweep: () => Promise<RunClosureSweepResult>) =>
  ({ sweep }) as unknown as RunClosureService;

describe('cong tac van hanh cua luot quet', () => {
  it('khong khai gi = BAT — muc tieu cua ca lane khong duoc phu thuoc vao mot dong cau hinh', () => {
    expect(runClosureSweepEnabled(undefined)).toBe(true);
    expect(runClosureSweepEnabled('')).toBe(true);
    expect(runClosureSweepEnabled('on')).toBe(true);
    expect(runClosureSweepEnabled('ON')).toBe(true);
  });

  it('`off` la gia tri DUY NHAT tat duoc, va khong phan biet hoa thuong', () => {
    expect(runClosureSweepEnabled('off')).toBe(false);
    expect(runClosureSweepEnabled(' OFF ')).toBe(false);
  });

  it('tat thi KHONG dung timer nao', async () => {
    const original = process.env[RUN_CLOSURE_SWEEP_SWITCH_ENV];
    process.env[RUN_CLOSURE_SWEEP_SWITCH_ENV] = 'off';
    const sweep = vi.fn();
    const scheduler = new RunClosureSweepScheduler(fakeService(sweep), policy(1));

    try {
      scheduler.onModuleInit();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sweep).not.toHaveBeenCalled();
    } finally {
      scheduler.onModuleDestroy();
      if (original === undefined) delete process.env[RUN_CLOSURE_SWEEP_SWITCH_ENV];
      else process.env[RUN_CLOSURE_SWEEP_SWITCH_ENV] = original;
    }
  });
});

describe('vong lap cua luot quet', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /*
   * DONG HO GIA, khong phai `setTimeout` that. Mot nhip 1 giay ma phai cho that thi bai kiem vua
   * cham vua khong tat dinh — va nghich ly la no se de "xanh" khi may cham, vi luc do nhieu nhip
   * kip chay hon.
   */
  const withFakeTimers = async (run: () => Promise<void>): Promise<void> => {
    vi.useFakeTimers();
    try {
      await run();
    } finally {
      vi.useRealTimers();
    }
  };

  it('quet ngay mot lan luc khoi dong, roi lap lai theo nhip', async () => {
    await withFakeTimers(async () => {
      const sweep = vi.fn(async (): Promise<RunClosureSweepResult> => ({ scanned: 0, closed: 0 }));
      const scheduler = new RunClosureSweepScheduler(fakeService(sweep), policy(1));

      scheduler.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);
      // Mot lan NGAY, khong doi nhip dau tien: mot tien trinh vua khoi dong lai sau khi chet phai
      // hoi lai ngay, chu khong ngoi cho het mot nhip.
      expect(sweep).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(sweep).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(sweep).toHaveBeenCalledTimes(3);

      scheduler.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(3_000);
      // Da tat thi khong con nhip nao chay nua.
      expect(sweep).toHaveBeenCalledTimes(3);
    });
  });

  it('mot luot quet NEM khong lam chet tien trinh, va khong chan luot ke tiep', async () => {
    await withFakeTimers(async () => {
      let calls = 0;
      const sweep = vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('CSDL ngat');
        return { scanned: 0, closed: 0 };
      });
      const scheduler = new RunClosureSweepScheduler(fakeService(sweep), policy(1));

      /*
       * `onModuleInit` KHONG duoc nem: mot lan quet hong luc boot se bien mot su co tam thoi cua
       * CSDL thanh mot tien trinh API khong khoi dong duoc.
       */
      expect(() => scheduler.onModuleInit()).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
      expect(sweep).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(sweep).toHaveBeenCalledTimes(2);

      scheduler.onModuleDestroy();
    });
  });

  it('mot nhip CHAM khong chay chong len nhip truoc', async () => {
    await withFakeTimers(async () => {
      let resolveSlow: (() => void) | undefined;
      const sweep = vi.fn(
        () =>
          new Promise<RunClosureSweepResult>((resolve) => {
            resolveSlow = () => resolve({ scanned: 0, closed: 0 });
          }),
      );
      const scheduler = new RunClosureSweepScheduler(fakeService(sweep), policy(1));

      scheduler.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);

      // Nhip chac chan da den trong luc nhip truoc con dang chay.
      await vi.advanceTimersByTimeAsync(5_000);
      expect(sweep).toHaveBeenCalledTimes(1);

      resolveSlow?.();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sweep).toHaveBeenCalledTimes(2);

      scheduler.onModuleDestroy();
    });
  });

  it('timer khong giu tien trinh song', () => {
    const scheduler = new RunClosureSweepScheduler(
      fakeService(async () => ({ scanned: 0, closed: 0 })),
      policy(3_600),
    );

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    scheduler.onModuleInit();
    const timer = setIntervalSpy.mock.results[0]?.value as NodeJS.Timeout;

    // `.unref()` la thu phan biet mot bo lich cua tien trinh nen voi mot bo lich giu tien trinh
    // song chi vi no.
    expect(timer.hasRef()).toBe(false);
    scheduler.onModuleDestroy();
  });
});
