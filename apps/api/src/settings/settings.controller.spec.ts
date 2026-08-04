import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import type { AuditLogService } from '../audit/audit-log.service.js';
import type { RuleConfigService } from '../rule-config/rule-config.service.js';
import type { SettingsQueryService } from './settings-query.service.js';
import type { SourceTruthWriteService } from './source-truth-write.service.js';
import { createDefaultRuleConfigPayload } from '../rule-config/rule-config.defaults.js';
import { SettingsController } from './settings.controller.js';

function build() {
  const query = {
    summary: vi.fn(async () => ({ channelMode: 'hybrid' })),
    sourceTruth: vi.fn(() => []),
  } as unknown as SettingsQueryService;
  const writes = { write: vi.fn(async () => []) } as unknown as SourceTruthWriteService;
  const runtime = {
    autoSend: vi.fn(() => 'off'),
    setAutoSend: vi.fn((enabled: boolean) => ({ autoSend: enabled ? 'on' : 'off' })),
  } as unknown as RuntimeSettingsService;
  const rules = {
    list: vi.fn(async () => []),
    createDraft: vi.fn(async () => ({ id: 'r1' })),
    preview: vi.fn(async () => ({
      id: 'r1',
      version: 1,
      status: 'preview' as const,
      payload: createDefaultRuleConfigPayload(),
      createdBy: 'operator',
      activatedBy: null,
      createdAt: '2026-08-03T00:00:00.000Z',
      activatedAt: null,
    })),
    activate: vi.fn(async () => ({ id: 'r1', status: 'active' })),
  } as unknown as RuleConfigService;
  const audit = {
    append: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
  } as unknown as AuditLogService;
  return {
    controller: new SettingsController(query, writes, runtime, rules, audit),
    query,
    writes,
    runtime,
    rules,
    audit,
  };
}

describe('SettingsController', () => {
  it('tra tong quan tu mot facade duy nhat', async () => {
    const { controller, query } = build();

    await expect(controller.summary()).resolves.toEqual({ channelMode: 'hybrid' });
    expect(query.summary).toHaveBeenCalledTimes(1);
  });

  it('AUTO_SEND on bat buoc acknowledged=true va ghi audit', async () => {
    const { controller, runtime, audit } = build();

    await expect(
      controller.setAutoSend({ enabled: true }, undefined, 'operator', 'req-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await controller.setAutoSend(
      { enabled: true, acknowledged: true },
      undefined,
      'operator',
      'req-1',
    );

    expect(runtime.setAutoSend).toHaveBeenCalledWith(true);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'automation.auto_send', after: { autoSend: 'on' } }),
    );
  });

  it('rules phai qua draft -> preview -> activate va moi buoc co audit', async () => {
    const { controller, rules, audit } = build();

    await controller.createRule({ payload: { schemaVersion: 1 } }, undefined, 'operator', 'req-2');
    await controller.previewRule(
      'r1',
      {
        sampleOrder: {
          orderType: 'TH2',
          totalQuantity: 1,
          region: 'HN',
          itemsSubtotal: 1_000_000,
          codCollect: false,
          wantVat: false,
        },
      },
      undefined,
      'operator',
      'req-3',
    );
    await controller.activateRule(
      'r1',
      { confirmed: true },
      undefined,
      'operator',
      'req-4',
    );

    expect(rules.createDraft).toHaveBeenCalled();
    expect(rules.preview).toHaveBeenCalledWith('r1');
    expect(rules.activate).toHaveBeenCalledWith('r1', 'operator');
    expect(audit.append).toHaveBeenCalledTimes(3);
  });

  it('preview rules computes a pure TH2 sample without writing an order', async () => {
    const { controller, rules } = build();
    vi.mocked(rules.preview).mockResolvedValueOnce({
      id: 'r1',
      version: 2,
      status: 'preview',
      payload: {
        schemaVersion: 1,
        rules: {
          freeShipMinQuantity: 5,
          shipFeeNoiThanh: 30_000,
          shipFeeTinh: 50_000,
          vatRate: 0.1,
          codFee: 20_000,
          totalMismatchTolerance: 0.05,
          noiThanhKeywords: ['hn'],
        },
        agents: { largeOrderTotal: 20_000_000, largeOrderQuantity: 10, lowConfidence: 0.7 },
      },
      createdBy: 'operator',
      activatedBy: null,
      createdAt: '2026-08-03T00:00:00.000Z',
      activatedAt: null,
    });

    const preview = await controller.previewRule(
      'r1',
      {
        sampleOrder: {
          orderType: 'TH2',
          totalQuantity: 1,
          region: 'HN',
          itemsSubtotal: 1_000_000,
          codCollect: true,
          wantVat: true,
        },
      },
      undefined,
      'operator',
    );

    expect(preview.totals).toEqual({
      itemsSubtotal: 1_000_000,
      shippingFee: 30_000,
      vatAmount: 100_000,
      codFee: 20_000,
      grandTotal: 1_150_000,
    });
  });

  it('creates an override with both immutable composite identifiers preserved', async () => {
    const { controller, writes } = build();

    await controller.putNewSourceTruth(
      'overrides',
      { dealerId: 'dealer-1', sku: 'FELIX', price: 1_100_000 },
      undefined,
      'operator',
    );

    expect(writes.write).toHaveBeenCalledWith(
      'overrides',
      'dealer-1:FELIX',
      { dealerId: 'dealer-1', sku: 'FELIX', price: 1_100_000 },
      'operator',
      null,
    );
  });
});
