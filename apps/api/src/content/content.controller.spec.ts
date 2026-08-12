import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { ROLES_KEY } from '../auth/roles.decorator.js';
import type { ContentImportService } from './content-import.service.js';
import type { ContentManagementService } from './content-management.service.js';
import type { ContentService } from './content.service.js';
import { ContentController } from './content.controller.js';

function build() {
  const snapshot = { provenance: [], assets: [], faqs: [], advice: [], links: [], readiness: [] };
  const content = {
    snapshot: vi.fn(() => snapshot),
    reload: vi.fn(async () => snapshot),
  } as unknown as ContentService;
  const management = {
    save: vi.fn(async () => snapshot),
    transition: vi.fn(async () => snapshot),
  } as unknown as ContentManagementService;
  const imports = {
    preview: vi.fn(async () => ({
      creates: 1,
      updates: 0,
      unchanged: 0,
      conflicts: 0,
      errors: [],
    })),
    apply: vi.fn(async () => ({
      creates: 1,
      updates: 0,
      unchanged: 0,
      conflicts: 0,
      errors: [],
      applied: 1,
      skippedConflicts: 0,
    })),
  } as unknown as ContentImportService;
  const audit = { append: vi.fn(async () => undefined) } as unknown as AuditLogService;
  return {
    controller: new ContentController(content, management, imports, audit),
    content,
    management,
    imports,
    audit,
  };
}

describe('ContentController', () => {
  it('requires an explicit manifest envelope for import preview', () => {
    const { controller } = build();
    expect(() => controller.previewImport({ wrong: true })).toThrow(BadRequestException);
  });

  it('applies a confirmed import, reloads live content, and audits the mutation', async () => {
    const { controller, content, audit } = build();
    const manifest = {
      source: { kind: 'local_manifest', sourceId: 'inventory' },
      assets: [],
      faqs: [],
      advice: [],
      links: [],
    };

    await controller.applyImport({ manifest, confirmed: true }, 'sale-1', 'req-1');

    expect(content.reload).toHaveBeenCalledOnce();
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'sale-1', action: 'content.import' }),
    );
  });

  it('protects drafts and approval with separate generic role sets', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ContentController.prototype.create)).toEqual([
      'SALE',
      'MANAGER',
      'ADMIN',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ContentController.prototype.transition)).toEqual([
      'MANAGER',
      'ADMIN',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ContentController.prototype.reload)).toEqual([
      'MANAGER',
      'ADMIN',
    ]);
  });
});
