import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderView } from '@netviet/shared';
import { resolve } from 'node:path';
import {
  WorkerProcess,
  apiDir,
  baseEnv,
  enginePortOpen,
  waitFor,
  RUN_COMPLETE_TIMEOUT_MS,
} from './__tests__/workflow-it.harness.js';

/**
 * DUONG NGHIEP VU THAT -> HATCHET. Day la bai kiem quan trong nhat cua khuon
 * `sales-handoff-followup`, va la thu phan biet mot workflow THAT voi mot khuon ha tang.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG GOI `handoff.handoff({...})` TRONG BAI NAY:
 *
 * Goi thang cau noi chi chung minh "mot chuoi di duoc tu A sang B" — dung thu ma
 * `workflow-e2e.int.spec.ts` da chung minh tu truoc. Cai CHUA duoc chung minh, va la ly do
 * phien nay ton tai, la: mot THAO TAC NGHIEP VU THAT (`OrdersService.sendConfirmation`) co tu
 * no sinh ra mot lan chay workflow ben vung hay khong.
 *
 * Nen bai nay bat dau tu dung cho do, va di het:
 *
 *   OrdersService.sendConfirmation()          thao tac nghiep vu that
 *     -> Order = sent + salesHandoff.pending  trang thai nghiep vu that
 *     -> hang WorkflowOutbox                  cung giao dich
 *     -> WorkflowScheduler tick               dispatcher that
 *     -> Hatchet engine                       engine that (khong gia lap)
 *     -> worker: load-state / wait / recheck  tien trinh RIENG, code that
 *     -> HTTP quay lai API                    cong exactly-once that
 *     -> salesHandoff.followUp                trang thai nghiep vu doi
 *
 * ---------------------------------------------------------------------------
 * CHAY O DAU: can engine that. `RUN_WORKFLOW_IT=1` + engine mo cong, giong moi bai IT khac.
 */

const RUN_IT = process.env.RUN_WORKFLOW_IT === '1';

const FIXTURE = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/sales-handoff-followup',
);

/** Cung khuon, chi khac `remindAfterSeconds: 25` — de co cho ma giet worker o GIUA lan ngu. */
const SLOW_FIXTURE = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/sales-handoff-followup-slow',
);

interface RunningApi {
  readonly port: number;
  readonly orders: {
    sendConfirmation: (id: string) => Promise<OrderView>;
    completeSalesHandoff: (id: string, actor?: string) => Promise<OrderView>;
  };
  readonly repo: {
    create: (view: OrderView) => Promise<OrderView>;
    findById: (id: string) => Promise<OrderView | null>;
  };
  readonly outboxCount: () => Promise<number>;
  readonly close: () => Promise<void>;
}

/**
 * Boot API THAT co lang nghe HTTP.
 *
 * Phai la HTTP that chu khong phai application context: worker song trong mot TIEN TRINH KHAC
 * va chi noi chuyen duoc qua mang. Mot `createApplicationContext()` se khong co cong nao de
 * worker goi vao, va bai kiem se phai gia lap dung cai doan can chung minh nhat.
 */
async function bootHttpApi(env: NodeJS.ProcessEnv): Promise<RunningApi> {
  Object.assign(process.env, env);
  delete process.env.TENANT;
  const { resetTenantCache } = await import('@netviet/tenant');
  resetTenantCache();

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { OrdersService } = await import('../orders/orders.service.js');
  const { OrdersRepository } = await import('../orders/orders.repository.js');
  const { WorkflowOutboxRepository } = await import('./workflow-outbox.repository.js');

  const app = await NestFactory.create(await AppModule.forRoot(), {
    logger: ['error'],
    abortOnError: false,
  });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const port = Number(new URL(url.replace('[::1]', '127.0.0.1')).port);

  const get = <T>(token: unknown): T => app.get(token as never, { strict: false }) as T;
  const outbox = get<{ countPending: () => Promise<number> }>(WorkflowOutboxRepository);

  return {
    port,
    orders: get(OrdersService),
    repo: get(OrdersRepository),
    outboxCount: () => outbox.countPending(),
    close: () => app.close(),
  };
}

function orderReadyToSend(id: string): OrderView {
  return {
    id,
    status: 'approved',
    intent: 'dat_don',
    chatId: 'IT-handoff-followup',
    rawText: 'lay 1 aaa',
    createdAt: new Date().toISOString(),
    priced: {
      lines: [
        {
          skuRaw: 'AAA',
          sku: 'AAA',
          productName: 'Widget',
          quantity: 1,
          unitPrice: 100_000,
          lineTotal: 100_000,
          matched: true,
        },
      ],
      grandTotal: 100_000,
      warnings: [],
      confirmationText: 'XAC NHAN DON',
      policy: 'thanh_toan_ngay',
    },
  } as unknown as OrderView;
}

describe.skipIf(!RUN_IT)('sales-handoff-followup — duong nghiep vu that toi Hatchet', () => {
  let api: RunningApi;
  let worker: WorkerProcess;

  beforeAll(async () => {
    if (!(await enginePortOpen())) {
      throw new Error('Engine chua mo cong — bai nay can engine THAT, khong gia lap.');
    }

    // Cong 0 -> he dieu hanh cap. Phai boot API TRUOC de biet cong nao, roi moi tra cong do cho
    // worker qua `WORKFLOW_DESTINATION_SELF_API`: dich den logic -> URL that la cau hinh HA TANG.
    api = await bootHttpApi(baseEnv(FIXTURE, 0));
    const env = baseEnv(FIXTURE, 0, {
      WORKFLOW_DESTINATION_SELF_API: `http://127.0.0.1:${api.port}/internal/sales-handoff`,
    });
    worker = new WorkerProcess('v1', env, { template: 'sales-handoff-followup' });
    await worker.start();
  }, 240_000);

  afterAll(async () => {
    await worker?.stop();
    await api?.close();
  });

  /**
   * ACCEPTANCE. Mot thao tac nghiep vu that, khong mot lan goi ha tang nao trong bai.
   */
  it('chot don -> outbox -> engine -> worker ngu -> doc lai -> danh dau', async () => {
    const view = await api.repo.create(orderReadyToSend('it-followup-1'));

    const sent = await api.orders.sendConfirmation(view.id);
    // (1) TRANG THAI NGHIEP VU commit truoc, va no la thu sinh ra su kien.
    expect(sent.status).toBe('sent');
    expect(sent.salesHandoff?.status).toBe('pending');
    // (2) Su kien nam trong outbox — chua ai cham toi engine o thoi diem nay.
    expect(await api.outboxCount()).toBeGreaterThan(0);

    // (3) dispatcher -> engine -> worker. Worker ngu `REMIND_AFTER_SECONDS` roi doc lai.
    //
    // Giu lai ban doc CUOI CUNG de thong bao that bai noi duoc trang thai luc het gio — mot
    // "timeout" tran khong tra loi duoc cau "no dung o buoc nao".
    let lastSeen: OrderView | null = null;
    await waitFor(
      async () => {
        lastSeen = await api.repo.findById(view.id);
        return lastSeen?.salesHandoff?.followUp?.stage === 'reminder';
      },
      RUN_COMPLETE_TIMEOUT_MS,
      () =>
        `khong thay dau vet theo doi tren don. ` +
        `salesHandoff=${JSON.stringify(lastSeen?.salesHandoff)}\n` +
        `worker output:\n${worker.output.slice(-2000)}`,
    );

    const marked = await api.repo.findById(view.id);
    // Danh dau KHONG duoc lam viec ban giao bien mat: no van la viec cua nguoi.
    expect(marked?.salesHandoff?.status).toBe('pending');
    expect(marked?.status).toBe('sent');

    /*
     * AI da danh dau — phai la WORKER, khong phai mot duong nao khac trong tien trinh API.
     *
     * CHO dong log thay vi doc `output` ngay: API nhin thay thay doi ngay khi no phuc vu xong
     * yeu cau HTTP, con stdout cua tien trinh con thi ve toi day qua mot ong dan RIENG. Doc
     * ngay la mot cuoc dua ma API luon thang — va do dung la cach bai nay do o lan chay dau.
     */
    await waitFor(
      () => worker.output.includes(`recheck ${view.id}: danh dau=true`),
      30_000,
      () => `worker khong ghi nhan lan danh dau. Output:\n${worker.output.slice(-2000)}`,
    );
  }, 240_000);

});

/**
 * CRASH / RECOVERY — lan ngu phai song sot qua cai chet cua worker.
 *
 * DAY LA LY DO KHUON NAY CAN MOT WORKFLOW ENGINE, va la bai kiem duy nhat chung minh dieu do.
 * Mot `setTimeout` trong tien trinh `api` se bien mat cung tien trinh; ma `api` bi
 * `--force-recreate` moi lan deploy (`deploy-stack.sh:88`), tuc moi hen gio dang treo se mat
 * sach o moi lan release — va khong ai biet da mat cai gi.
 *
 * Bo cua so cho DAI hon han (goi khach `-slow`, 25 giay) de co cho ma GIET worker o giua. Voi
 * fixture 3 giay o tren thi khong ton tai cua so do.
 */
describe.skipIf(!RUN_IT)('sales-handoff-followup — lan ngu song sot qua worker chet', () => {
  let api: RunningApi;
  let first: WorkerProcess;
  let second: WorkerProcess | undefined;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    if (!(await enginePortOpen())) {
      throw new Error('Engine chua mo cong — bai nay can engine THAT, khong gia lap.');
    }
    api = await bootHttpApi(baseEnv(SLOW_FIXTURE, 0));
    env = baseEnv(SLOW_FIXTURE, 0, {
      WORKFLOW_DESTINATION_SELF_API: `http://127.0.0.1:${api.port}/internal/sales-handoff`,
    });
    first = new WorkerProcess('v1', env, { template: 'sales-handoff-followup', label: 'truoc' });
    await first.start();
  }, 240_000);

  afterAll(async () => {
    await first?.kill();
    await second?.stop();
    await api?.close();
  });

  /**
   * NGUOI THANG WORKFLOW — tren engine that, trong lan ngu that.
   *
   * NAM O KHOI `-slow` (25 giay) chu khong o khoi 3 giay, va do la mot bai hoc chu khong phai
   * mot lua chon: voi cua so 3 giay, workflow thuong xong TRUOC khi con nguoi kip bam, nen bai
   * kiem do chinh no chu khong do he thong. Mot bai kiem ve "chuyen gi xay ra GIUA lan ngu"
   * bat buoc phai co mot lan ngu du dai de co chu "giua".
   */
  it('nguoi hoan tat trong luc workflow dang ngu -> khong nhac', async () => {
    const view = await api.repo.create(orderReadyToSend('it-followup-human'));
    await api.orders.sendConfirmation(view.id);

    // Cho toi khi lan ngu DA BAT DAU — doi dung dong log cua buoc do, khong doan bang `sleep`.
    await waitFor(
      () => first.countLog(`load-state ${view.id}: con treo`) >= 1,
      RUN_COMPLETE_TIMEOUT_MS,
      () => `worker chua vao lan ngu. Output:\n${first.output.slice(-2000)}`,
    );

    // CON NGUOI xu ly xong, trong khi workflow con dang ngu.
    await api.orders.completeSalesHandoff(view.id, 'nguoi.that');

    // Cho toi khi workflow THUC DAY va cham toi don nay — neu chi `sleep` mot con so thi bai
    // kiem se ket luan "khong nhac" trong khi that ra workflow chua kip chay.
    await waitFor(
      () => first.output.includes(`recheck ${view.id}:`),
      RUN_COMPLETE_TIMEOUT_MS,
      () => `workflow chua thuc day cho don nay. Output:\n${first.output.slice(-2000)}`,
    );

    const after = await api.repo.findById(view.id);
    expect(after?.salesHandoff?.status).toBe('completed');
    // BAT BIEN THAT SU CAN GIU: khong co lan nhac nao duoc ap len mot viec da xong.
    expect(after?.salesHandoff?.followUp).toBeUndefined();

    /*
     * KHONG khang dinh nhanh nao da chan — chi khang dinh RANG no bi chan.
     *
     * Hai lop deu dung, va lop nao bat duoc tuy vao con nguoi bam nut o mili giay nao:
     *
     *   worker  `loadHandoffState` o buoc recheck thay `completed` -> khong goi `ensureFollowup`
     *   API     `markFollowup` thay khong con `pending` -> tra `applied: false`
     *
     * Khang dinh PHU DINH duoi day dung cho ca hai nhanh, va no van do neu mot ngay nao do ca
     * hai lop cung thung.
     */
    expect(first.output).not.toContain(`recheck ${view.id}: danh dau=true`);
  }, 300_000);

  it('GIET worker giua lan ngu -> worker moi len -> viec van duoc danh dau', async () => {
    const view = await api.repo.create(orderReadyToSend('it-followup-crash'));
    await api.orders.sendConfirmation(view.id);

    // Cho toi khi lan ngu DA BAT DAU — khong doan bang `sleep`, doi dung dong log cua buoc do.
    await waitFor(
      () => first.countLog(`load-state ${view.id}: con treo`) >= 1,
      RUN_COMPLETE_TIMEOUT_MS,
      () => `worker chua vao lan ngu. Output:\n${first.output.slice(-2000)}`,
    );

    // SIGKILL — khong co co hoi don dep, dung nhu container bi OOM hay VM mat dien.
    await first.kill();
    expect(await api.repo.findById(view.id)).toMatchObject({
      salesHandoff: { status: 'pending' },
    });
    // Chua ai danh dau gi ca o thoi diem worker chet.
    expect((await api.repo.findById(view.id))?.salesHandoff?.followUp).toBeUndefined();

    // Worker MOI — tien trinh khac, PID khac, khong biet gi ve lan chay dang do.
    second = new WorkerProcess('v1', env, { template: 'sales-handoff-followup', label: 'sau' });
    await second.start();

    let lastSeen: OrderView | null = null;
    await waitFor(
      async () => {
        lastSeen = await api.repo.findById(view.id);
        return lastSeen?.salesHandoff?.followUp?.stage === 'reminder';
      },
      RUN_COMPLETE_TIMEOUT_MS,
      () =>
        `lan ngu KHONG song sot qua worker chet. ` +
        `salesHandoff=${JSON.stringify(lastSeen?.salesHandoff)}\n` +
        `worker moi:\n${second?.output.slice(-2000)}`,
    );

    // Va dung MOT lan danh dau, du co hai tien trinh worker da tung cam viec nay.
    const marked = await api.repo.findById(view.id);
    expect(marked?.salesHandoff?.followUp?.stage).toBe('reminder');
    expect(marked?.salesHandoff?.status).toBe('pending');
  }, 300_000);
});
