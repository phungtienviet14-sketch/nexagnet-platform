import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import type { WorkflowEngineIntegration } from '@netviet/tenant';
import { TelemetryService } from '../observability/telemetry.service.js';
import { DisabledWorkflowEngineAdapter } from './disabled-workflow-engine.adapter.js';
import { WorkflowDispatcher } from './workflow-dispatcher.js';
import {
  WorkflowHandoffService,
  WORKFLOW_BINDINGS,
  WORKFLOW_RUNTIME_IDENTITY,
} from './workflow-handoff.service.js';
import type { WorkflowEnginePort } from './workflow-engine.port.js';
import {
  InMemoryWorkflowOutboxRepository,
  WorkflowOutboxRepository,
} from './workflow-outbox.repository.js';

const binding = {
  key: 'integration-handoff',
  version: 'v1',
  enabled: true,
  destination: 'erp-primary',
  idempotency: 'key',
  operationVersion: 1,
  retry: { maxAttempts: 5, baseBackoffSeconds: 30 },
} as const;

/** KHACH A — bat workflow. */
const TENANT_A: WorkflowEngineIntegration = {
  adapter: 'hatchet',
  credentialRef: 'ALPHA_WORKFLOW_TOKEN',
  bindings: [binding],
};
/** KHACH B — khong dung workflow engine. */
const TENANT_B: WorkflowEngineIntegration = { adapter: 'none', bindings: [] };
/** KHACH C — CUNG khuon, khac dich den va khac muc idempotency. */
const TENANT_C: WorkflowEngineIntegration = {
  adapter: 'hatchet',
  credentialRef: 'GAMMA_WORKFLOW_TOKEN',
  bindings: [{ ...binding, destination: 'webhook-basic', idempotency: 'none', operationVersion: 2 }],
};

const REQUEST = {
  workflowKey: 'integration-handoff',
  operation: 'create',
  entityType: 'order',
  entityId: 'ord_1',
} as const;

const KEY_A = 'tenant-alpha:gd1-test:integration-handoff:v1:order:ord_1:create:erp-primary';

/**
 * Dung container THAT cua Nest (khong `new` bang tay) — cung khuon `app.module.boot.spec.ts`.
 *
 * Ly do do file kia da ghi ro va van dung o day: moi spec dung `new Service(...)` thi KHONG bao
 * gio cham toi DI, nen loi kieu "Nest khong resolve duoc phu thuoc" lot qua ca suite va chi lo
 * ra khi chay that. Repo khong co `@nestjs/testing`; `createApplicationContext` lam dung viec do
 * ma khong them mot dependency chi de test.
 */
async function contextWith(providers: Parameters<typeof buildModule>[0]) {
  return NestFactory.createApplicationContext(buildModule(providers), { logger: ['error'] });
}

function buildModule(providers: NonNullable<Parameters<typeof Module>[0]>['providers']) {
  @Module({ providers })
  class HarnessModule {}
  return HarnessModule;
}

async function buildHandoff(
  bindings: WorkflowEngineIntegration,
  tenant: string,
  outbox = new InMemoryWorkflowOutboxRepository(),
): Promise<{ handoff: WorkflowHandoffService; outbox: InMemoryWorkflowOutboxRepository }> {
  const context = await contextWith([
    WorkflowHandoffService,
    { provide: WorkflowOutboxRepository, useValue: outbox },
    { provide: WORKFLOW_BINDINGS, useValue: bindings },
    { provide: WORKFLOW_RUNTIME_IDENTITY, useValue: { tenant, environment: 'gd1-test' } },
  ]);
  return { handoff: context.get(WorkflowHandoffService), outbox };
}

describe('WorkflowHandoffService — cau noi duy nhat tu nghiep vu sang engine', () => {
  it('KHACH A (bat): xep hang, sinh khoa thao tac day du tam chieu', async () => {
    const { handoff, outbox } = await buildHandoff(TENANT_A, 'tenant-alpha');

    const result = await handoff.handoff(REQUEST);

    expect(result.outcome).toBe('queued');
    expect(result.operationKey).toBe(KEY_A);
    expect(await outbox.countPending()).toBe(1);
  });

  it('KHACH B (khong dung engine): BO QUA co ma ly do, khong nem, khong xep hang', async () => {
    const { handoff, outbox } = await buildHandoff(TENANT_B, 'tenant-beta');

    const result = await handoff.handoff(REQUEST);

    expect(result).toEqual({ outcome: 'skipped', reason: 'NO_TENANT_BINDING' });
    expect(await outbox.countPending()).toBe(0);
  });

  it('KHACH C: CUNG khuon, khac cau hinh -> khac khoa. Khong sua mot dong nhan nao', async () => {
    const { handoff } = await buildHandoff(TENANT_C, 'tenant-gamma');

    const result = await handoff.handoff(REQUEST);

    expect(result.operationKey).toBe(
      'tenant-gamma:gd1-test:integration-handoff:v2:order:ord_1:create:webhook-basic',
    );
  });

  it('CACH LY KHACH: cung mot thuc the o hai khach ra hai khoa khac nhau', async () => {
    const alpha = await buildHandoff(TENANT_A, 'tenant-alpha');
    const gamma = await buildHandoff(TENANT_C, 'tenant-gamma');

    const a = await alpha.handoff.handoff(REQUEST);
    const c = await gamma.handoff.handoff(REQUEST);

    expect(a.operationKey).not.toBe(c.operationKey);
  });

  it('xep hai lan cung mot thao tac -> mot hang (lan thu lai cua tang tren la vo hai)', async () => {
    const { handoff, outbox } = await buildHandoff(TENANT_A, 'tenant-alpha');

    await handoff.handoff(REQUEST);
    await handoff.handoff(REQUEST);

    expect(await outbox.countPending()).toBe(1);
  });

  it('payload xep hang la THAM CHIEU — khong truong nao mang du lieu ca nhan', async () => {
    const { handoff, outbox } = await buildHandoff(TENANT_A, 'tenant-alpha');

    await handoff.handoff(REQUEST);

    const row = await outbox.findByOperationKey(KEY_A);
    expect(Object.keys(row?.payload ?? {}).sort()).toEqual([
      'destination',
      'entityId',
      'entityType',
      'operation',
      'operationVersion',
      'tenant',
    ]);
  });

  it('metadata chi co neo tuong quan mang tien to nexagnet. va mot traceparent', async () => {
    const { handoff, outbox } = await buildHandoff(TENANT_A, 'tenant-alpha');

    await handoff.handoff(REQUEST);

    const row = await outbox.findByOperationKey(KEY_A);
    const keys = Object.keys(row?.metadata ?? {});
    expect(keys).toContain('traceparent');
    expect(
      keys.filter((key) => key !== 'traceparent').every((key) => key.startsWith('nexagnet.')),
    ).toBe(true);
  });

  it('nem khi goi khach tro toi mot phien ban khuon ma ban dang chay KHONG mang', async () => {
    const { handoff } = await buildHandoff(
      { ...TENANT_A, bindings: [{ ...binding, version: 'v9' }] },
      'tenant-alpha',
    );

    await expect(handoff.handoff(REQUEST)).rejects.toThrow(/WORKFLOW_VERSION_UNKNOWN/);
  });

  it('QUAN SAT KHONG LA DIEU KIEN CUA NGHIEP VU: telemetry nem thi van xep hang duoc', async () => {
    const outbox = new InMemoryWorkflowOutboxRepository();
    const brokenTelemetry = {
      stateChange: () => {
        throw new Error('sink hong');
      },
    } as unknown as TelemetryService;
    const context = await contextWith([
      WorkflowHandoffService,
      { provide: WorkflowOutboxRepository, useValue: outbox },
      { provide: WORKFLOW_BINDINGS, useValue: TENANT_A },
      {
        provide: WORKFLOW_RUNTIME_IDENTITY,
        useValue: { tenant: 'tenant-alpha', environment: 'gd1-test' },
      },
      { provide: TelemetryService, useValue: brokenTelemetry },
    ]);

    const result = await context.get(WorkflowHandoffService).handoff(REQUEST);

    expect(result.outcome).toBe('queued');
    expect(await outbox.countPending()).toBe(1);
  });
});

describe('day noi day du: nghiep vu -> outbox -> cong -> engine', () => {
  let outbox: InMemoryWorkflowOutboxRepository;

  beforeEach(() => {
    outbox = new InMemoryWorkflowOutboxRepository();
  });

  it('khach A: mot lan ban giao di het duong va toi cong engine dung mot lan', async () => {
    const calls: string[] = [];
    class SpyEngine extends DisabledWorkflowEngineAdapter {
      override async trigger(command: {
        workflowKey: string;
        workflowVersion: string;
      }): Promise<{ engineRunId: string; workflowName: string }> {
        const name = `${command.workflowKey}.${command.workflowVersion}`;
        calls.push(name);
        return { engineRunId: 'run-x', workflowName: name };
      }
    }
    const engine = new SpyEngine() as unknown as WorkflowEnginePort;
    const { handoff } = await buildHandoff(TENANT_A, 'tenant-alpha', outbox);
    const dispatcher = new WorkflowDispatcher(outbox, engine, { workerId: 'w1', leaseSeconds: 60 });

    await handoff.handoff(REQUEST);
    await dispatcher.tick();
    await dispatcher.tick();

    // Ten workflow mang PHIEN BAN — co che ghim ma GATE A xac lap, di tron duong.
    expect(calls).toEqual(['integration-handoff.v1']);
  });
});

describe('do thi DI THAT cua production', () => {
  it('goi khach KHONG khai bao workflowEngine van boot, va cau noi van resolve duoc', async () => {
    // Goi khach cua bo test API (`vitest.setup.ts`) khong khai bao `integrations.workflowEngine`.
    // Day chinh la ca "tenant khong dung workflow engine" cua yeu cau da khach — va no phai boot
    // BINH THUONG chu khong phai boot duoc nho mot nhanh ngoai le nao do.
    const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), {
      logger: ['error'],
    });
    try {
      expect(context.get(WorkflowHandoffService, { strict: false })).toBeInstanceOf(
        WorkflowHandoffService,
      );
      const result = await context
        .get(WorkflowHandoffService, { strict: false })
        .handoff(REQUEST);
      expect(result).toEqual({ outcome: 'skipped', reason: 'NO_TENANT_BINDING' });
    } finally {
      await context.close();
    }
  }, 60_000);
});
