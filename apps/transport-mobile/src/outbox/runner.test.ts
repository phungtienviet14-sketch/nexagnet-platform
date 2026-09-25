import {
  InMemoryOutboxStore,
  OutboxEngine,
  type OutboxItem,
  type SendOutcome,
} from '@netviet/driver-outbox';
import { describe, expect, it } from 'vitest';
import { PAUSE_UNAUTHENTICATED } from './field-actions';
import { OutboxRunner, type RunnerState } from './runner';

function setup(send: (items: readonly OutboxItem[]) => Promise<readonly SendOutcome[]>) {
  const store = new InMemoryOutboxStore();
  let seq = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const engine = new OutboxEngine({
    store,
    now: () => new Date('2026-09-25T07:00:00.000Z'),
    newId: () => `row-${++seq}`,
    sender: {
      async sendBatch(items) {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        try {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return await send(items);
        } finally {
          concurrent -= 1;
        }
      },
    },
  });
  const states: RunnerState[] = [];
  const runner = new OutboxRunner(engine, (state) => states.push(state));
  const enqueue = (id: string, kind: 'PROOF' | 'OBSERVATION' = 'PROOF') =>
    engine.enqueue({
      clientEventId: id,
      kind,
      capturedAt: '2026-09-25T06:59:00.000Z',
      payload: {},
    });
  return { store, engine, runner, states, enqueue, maxConcurrent: () => maxConcurrent };
}

describe('OutboxRunner', () => {
  it('nhieu lan kick dong thoi -> MOT luong xa, khong gui trung', async () => {
    const sent: string[] = [];
    const { runner, enqueue, maxConcurrent } = setup(async (items) => {
      sent.push(...items.map((item) => item.clientEventId));
      return items.map(() => ({ kind: 'ACCEPTED' as const }));
    });
    await enqueue('a');
    await enqueue('b');

    await Promise.all([runner.kick(), runner.kick(), runner.kick()]);

    expect(maxConcurrent()).toBe(1);
    expect(sent.sort()).toEqual(['a', 'b']);
  });

  it('viec bam (PROOF) xa truoc ban dinh vi (OBSERVATION)', async () => {
    const order: string[] = [];
    const { runner, enqueue } = setup(async (items) => {
      order.push(items[0]!.kind);
      return items.map(() => ({ kind: 'ACCEPTED' as const }));
    });
    await enqueue('p1', 'OBSERVATION');
    await enqueue('c1', 'PROOF');

    await runner.kick();

    expect(order).toEqual(['PROOF', 'OBSERVATION']);
  });

  it('401 -> tam dung ca hang doi; viec van nguyen, khong bi chan', async () => {
    let calls = 0;
    const { runner, enqueue, engine } = setup(async (items) => {
      calls += 1;
      return items.map(() => ({ kind: 'RETRY' as const, reason: PAUSE_UNAUTHENTICATED }));
    });
    await enqueue('a');
    await enqueue('b', 'OBSERVATION');

    await runner.kick();
    await runner.kick();

    expect(runner.isPaused).toBe(true);
    expect(calls).toBe(1);
    expect(await engine.status()).toMatchObject({ pending: 2, blocked: 0 });

    runner.resume();
    expect(runner.isPaused).toBe(false);
  });

  it('bao trang thai cho giao dien (con bao nhieu viec, co dang chay)', async () => {
    const { runner, enqueue, states } = setup(async (items) =>
      items.map(() => ({ kind: 'ACCEPTED' as const })),
    );
    await enqueue('a');

    await runner.kick();

    expect(states[0]).toMatchObject({ pending: 1, running: true });
    expect(states.at(-1)).toMatchObject({ pending: 0, blocked: 0, running: false, paused: false });
  });
});
