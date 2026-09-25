import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toPublicTenantDescriptor } from '../public-descriptor.js';
import { tenantConfigSchema, type TenantConfig } from '../tenant.schema.js';

/**
 * Phep chieu cong khai doi nha tu `apps/web` sang goi nen tang de API dung chung (`/auth/client`).
 *
 * Bai nay khoa hai dieu ma viec doi nha co the lam hong ma khong ai thay: (1) CHI cac truong da
 * chon di ra — `policies`, `persona`, `bootstrap`, `smoke` o lai may chu; (2) tep van THUAN, vi web
 * nhung no vao duong render va mot import gia tri o day se keo `node:fs` cua loader theo.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const fixture = (name: string): TenantConfig =>
  tenantConfigSchema.parse(
    JSON.parse(readFileSync(join(HERE, 'fixtures', name, 'tenant.json'), 'utf8')),
  );

describe('toPublicTenantDescriptor', () => {
  it('chieu thuong hieu, nang luc va mui gio cua mot khach van tai', () => {
    const config = fixture('transport-core');
    const descriptor = toPublicTenantDescriptor(config);

    expect(descriptor).toEqual({
      branding: { ...config.branding, shortName: config.identity.shortName },
      experience: 'transport-operations',
      capabilities: ['transport-core'],
      integrationAdapters: { channel: [], parser: [] },
      readiness: { blockedCapabilities: [] },
      transport: { timeZone: 'Asia/Ho_Chi_Minh' },
    });
  });

  it('khong mot khoi noi bo nao cua goi khach di ra ngoai', () => {
    const descriptor = toPublicTenantDescriptor(fixture('transport-core'));

    expect(Object.keys(descriptor).sort()).toEqual([
      'branding',
      'capabilities',
      'experience',
      'integrationAdapters',
      'readiness',
      'transport',
    ]);
    const serialized = JSON.stringify(descriptor);
    for (const internal of ['policies', 'persona', 'bootstrap', 'smoke', 'slug']) {
      expect(serialized, internal).not.toContain(`"${internal}"`);
    }
  });

  it('tep phep chieu chi import KIEU — khong keo loader theo', () => {
    const source = readFileSync(join(HERE, '..', 'public-descriptor.ts'), 'utf8');
    const imports = source.split('\n').filter((line) => line.startsWith('import '));

    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line, line).toMatch(/^import type /);
  });
});
