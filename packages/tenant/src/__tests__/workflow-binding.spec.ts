import { describe, expect, it } from 'vitest';
import { workflowEngineIntegrationSchema } from '../workflow-binding.schema.js';
import { SALES_HANDOFF_FOLLOWUP_WORKFLOW, tenantConfigSchema } from '../tenant.schema.js';

/**
 * Goi khach TRUNG TINH toi thieu — khong ten khach that, khong SKU, khong gia.
 * Dung lai hinh dang cua fixture `knowledge-only` da co.
 */
const baseTenant = {
  schemaVersion: 2 as const,
  slug: 'fixture-alpha',
  identity: { displayName: 'Fixture Alpha', shortName: 'Alpha' },
  branding: {
    productName: 'Alpha Workspace',
    installName: 'Alpha Workspace',
    pageTitle: 'Alpha Workspace',
    pageDescription: 'Neutral tenant fixture.',
    themeColor: '#0f62fe',
    backgroundColor: '#f5f7fb',
    monogram: 'A',
    composerPlaceholder: 'Search',
  },
  experience: 'knowledge-workspace' as const,
  capabilities: ['knowledge'] as const,
  policies: { readiness: { blockedCapabilities: [] } },
  integrations: { contentSource: { adapter: 'local_manifest' as const } },
  bootstrap: { knowledge: { path: 'data/knowledge.json' } },
};

const validBinding = {
  key: 'integration-handoff',
  version: 'v1',
  enabled: true,
  destination: 'erp-primary',
  idempotency: 'key' as const,
  operationVersion: 1,
  retry: { maxAttempts: 5, baseBackoffSeconds: 30 },
};

describe('workflowEngineIntegrationSchema', () => {
  it('chap nhan mot rang buoc day du', () => {
    const parsed = workflowEngineIntegrationSchema.safeParse({
      adapter: 'hatchet',
      credentialRef: 'WORKFLOW_ENGINE_TOKEN',
      bindings: [validBinding],
    });
    expect(parsed.success).toBe(true);
  });

  it('`credentialRef` phai la TEN BIEN MOI TRUONG, khong phai gia tri', () => {
    // Mot chuoi trong nhu token that phai bi tu choi ngay o schema — day la lop chan cuoi
    // truoc khi mot bi mat bi commit vao git cung goi khach.
    const parsed = workflowEngineIntegrationSchema.safeParse({
      adapter: 'hatchet',
      credentialRef: 'eyJhbGciOiJFUzI1NiIsICJraWQiOiJsTFRld1EifQ.abc.def',
      bindings: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('adapter `hatchet` ma khong khai `credentialRef` thi hong — khong doan bien moi truong', () => {
    const parsed = workflowEngineIntegrationSchema.safeParse({ adapter: 'hatchet', bindings: [] });
    expect(parsed.success).toBe(false);
  });

  it('adapter `none` ma van bat mot rang buoc thi hong — cau hinh tu mau thuan', () => {
    const parsed = workflowEngineIntegrationSchema.safeParse({
      adapter: 'none',
      bindings: [validBinding],
    });
    expect(parsed.success).toBe(false);
  });

  it('adapter `none` voi rang buoc DA TAT thi hop le — giu duoc cau hinh de bat sau', () => {
    const parsed = workflowEngineIntegrationSchema.safeParse({
      adapter: 'none',
      bindings: [{ ...validBinding, enabled: false }],
    });
    expect(parsed.success).toBe(true);
  });

  it('hai rang buoc trung khoa thi hong — khong biet cai nao thang', () => {
    const parsed = workflowEngineIntegrationSchema.safeParse({
      adapter: 'hatchet',
      credentialRef: 'WORKFLOW_ENGINE_TOKEN',
      bindings: [validBinding, { ...validBinding, destination: 'erp-secondary' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('phien ban phai dang `vN` — `latest` pha chinh viec ghim phien ban', () => {
    for (const version of ['1', 'latest', 'v0']) {
      expect(
        workflowEngineIntegrationSchema.safeParse({
          adapter: 'hatchet',
          credentialRef: 'WORKFLOW_ENGINE_TOKEN',
          bindings: [{ ...validBinding, version }],
        }).success,
      ).toBe(false);
    }
  });

  it('tu choi truong khong khai bao — goi khach la du lieu ngoai, khong tin', () => {
    const parsed = workflowEngineIntegrationSchema.safeParse({
      adapter: 'hatchet',
      credentialRef: 'WORKFLOW_ENGINE_TOKEN',
      bindings: [],
      endpointUrl: 'https://erp.example.com/orders',
    });
    expect(parsed.success).toBe(false);
  });

  it('KHONG cho nhet credential tho vao rang buoc', () => {
    const parsed = workflowEngineIntegrationSchema.safeParse({
      adapter: 'hatchet',
      credentialRef: 'WORKFLOW_ENGINE_TOKEN',
      bindings: [{ ...validBinding, secretValue: 'x' }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('goi khach voi/khong workflow engine', () => {
  it('khach KHONG khai bao workflowEngine van nap duoc — boot binh thuong', () => {
    expect(tenantConfigSchema.safeParse(baseTenant).success).toBe(true);
  });

  it('khach CO khai bao workflowEngine nap duoc', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...baseTenant,
      integrations: {
        ...baseTenant.integrations,
        workflowEngine: {
          adapter: 'hatchet',
          credentialRef: 'WORKFLOW_ENGINE_TOKEN',
          bindings: [validBinding],
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('CUNG mot khuon workflow, HAI khach cau hinh khac nhau — khong sua mot dong nhan nao', () => {
    const alpha = tenantConfigSchema.safeParse({
      ...baseTenant,
      integrations: {
        ...baseTenant.integrations,
        workflowEngine: {
          adapter: 'hatchet',
          credentialRef: 'ALPHA_WORKFLOW_TOKEN',
          bindings: [validBinding],
        },
      },
    });
    const beta = tenantConfigSchema.safeParse({
      ...baseTenant,
      slug: 'fixture-beta',
      integrations: {
        ...baseTenant.integrations,
        workflowEngine: {
          adapter: 'hatchet',
          credentialRef: 'BETA_WORKFLOW_TOKEN',
          bindings: [
            {
              ...validBinding,
              destination: 'webhook-basic',
              // He ngoai cua khach nay KHONG co idempotency -> replay se bi chan.
              idempotency: 'none',
              retry: { maxAttempts: 2, baseBackoffSeconds: 120 },
            },
          ],
        },
      },
    });

    expect(alpha.success).toBe(true);
    expect(beta.success).toBe(true);
  });
});

describe('handoffFollowup.enabled doi mot rang buoc workflow dang bat', () => {
  const base = {
    schemaVersion: 2 as const,
    slug: 'x',
    identity: { displayName: 'X', shortName: 'X' },
    branding: {
      productName: 'X',
      installName: 'X',
      pageTitle: 'X',
      pageDescription: 'X',
      themeColor: '#000000',
      backgroundColor: '#ffffff',
      monogram: 'X',
      composerPlaceholder: 'X',
    },
    experience: 'operations-console' as const,
    capabilities: ['knowledge', 'messaging', 'turn-processing', 'sales-order', 'operations'],
    policies: {
      salesOrder: {
        supportedDealerPolicies: ['thanh_toan_ngay'],
        automation: null,
        retailAdvice: { priceField: 'minRetailPrice', qualifier: 'x' },
        handoffFollowup: { enabled: true, remindAfterSeconds: 60 },
      },
      readiness: { blockedCapabilities: [] },
    },
    integrations: {
      channel: { allowedAdapters: ['mock'] },
      parser: { allowedAdapters: ['deepseek'] },
    },
    persona: {
      messaging: { botName: 'X', mentionName: 'X' },
      turnProcessing: { parserIntro: 'x' },
      knowledge: { productFallbackDescription: 'x' },
    },
    bootstrap: {
      knowledge: { path: 'data/knowledge.json' },
      salesOrder: { path: 'data/knowledge.json' },
    },
  };

  const binding = {
    key: SALES_HANDOFF_FOLLOWUP_WORKFLOW,
    version: 'v1',
    enabled: true,
    destination: 'self-api',
    idempotency: 'key',
    operationVersion: 1,
    retry: { maxAttempts: 5, baseBackoffSeconds: 1 },
  };

  /**
   * BAT BAO DAM MA KHONG CO AI THUC HIEN — day la che do hong ma ca khuon workflow sinh ra de
   * xoa bo, nen no phai hong TO luc boot chu khong im lang luc chay.
   */
  it('bat theo doi ma thieu binding -> TU CHOI luc boot', () => {
    const parsed = tenantConfigSchema.safeParse(base);

    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain(SALES_HANDOFF_FOLLOWUP_WORKFLOW);
  });

  it('binding co nhung dang TAT -> van tu choi', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      integrations: {
        ...base.integrations,
        workflowEngine: {
          adapter: 'hatchet',
          credentialRef: 'WORKFLOW_ENGINE_TOKEN',
          bindings: [{ ...binding, enabled: false }],
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('bat theo doi + binding dang bat -> hop le', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      integrations: {
        ...base.integrations,
        workflowEngine: {
          adapter: 'hatchet',
          credentialRef: 'WORKFLOW_ENGINE_TOKEN',
          bindings: [binding],
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  /** TAT theo doi thi khong doi hoi gi — day la duong ma moi goi khach hien tai dang di. */
  it('enabled=false -> khong doi hoi binding nao', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...base,
      policies: {
        ...base.policies,
        salesOrder: {
          ...base.policies.salesOrder,
          handoffFollowup: { enabled: false, remindAfterSeconds: 60 },
        },
      },
    });

    expect(parsed.success).toBe(true);
  });
});
