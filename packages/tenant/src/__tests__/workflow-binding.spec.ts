import { describe, expect, it } from 'vitest';
import { workflowEngineIntegrationSchema } from '../workflow-binding.schema.js';
import { tenantConfigSchema } from '../tenant.schema.js';

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
