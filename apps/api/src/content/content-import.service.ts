import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AdviceContentView,
  ContentAssetView,
  ContentImportManifest,
  ContentImportPreview,
  ContentImportResult,
  ContentLinkView,
  ContentProvenanceView,
  FaqView,
} from '@netviet/shared';
import {
  ContentRepository,
  importedId,
  type ContentEntityKind,
  type ContentRecord,
} from './content.repository.js';
import { ContentSourcePort } from './content-source.port.js';

type Planned = {
  kind: ContentEntityKind;
  value: ContentRecord;
  state: 'create' | 'update' | 'unchanged' | 'conflict';
};

@Injectable()
export class ContentImportService {
  constructor(
    private readonly repo: ContentRepository,
    private readonly source: ContentSourcePort,
  ) {}

  async preview(input: unknown): Promise<ContentImportPreview> {
    const manifest = await this.source.load(input);
    const planned = await this.plan(manifest);
    const errors = await this.validateProductMappings(manifest);
    if (errors.length) throw new BadRequestException(`Manifest có lỗi: ${errors.join('; ')}`);
    return summarize(planned);
  }

  async apply(input: unknown, confirmed: boolean, _actor: string): Promise<ContentImportResult> {
    if (!confirmed) throw new Error('Phải xác nhận preview trước khi import nội dung');
    const manifest = await this.source.load(input);
    const planned = await this.plan(manifest);
    const errors = await this.validateProductMappings(manifest);
    if (errors.length) throw new BadRequestException(`Manifest có lỗi: ${errors.join('; ')}`);
    const provenance = provenanceFrom(manifest);
    await this.repo.saveProvenance(provenance);
    let applied = 0;
    for (const item of planned) {
      if (item.state !== 'create' && item.state !== 'update') continue;
      await this.repo.upsert(item.kind, item.value);
      applied += 1;
    }
    return {
      ...summarize(planned),
      applied,
      skippedConflicts: planned.filter((item) => item.state === 'conflict').length,
    };
  }

  private async plan(manifest: ContentImportManifest): Promise<Planned[]> {
    const snapshot = await this.repo.snapshot();
    const key = `${manifest.source.kind}:${manifest.source.sourceId}`;
    const records: { kind: ContentEntityKind; value: ContentRecord }[] = [
      ...manifest.assets.map((item) => ({
        kind: 'asset' as const,
        value: {
          id: importedId('asset', key, item.externalId),
          externalId: item.externalId,
          kind: item.kind,
          ...(item.title ? { title: item.title } : {}),
          locator: item.locator,
          ...(item.mimeType ? { mimeType: item.mimeType } : {}),
          source: manifest.source.kind,
          ...(item.sourceFileId ? { sourceFileId: item.sourceFileId } : {}),
          ...(item.hash ? { hash: item.hash } : {}),
          ...(item.version ? { version: item.version } : {}),
          status: 'draft',
          productSkus: item.productSkus,
          provenanceKey: key,
          operatorEdited: false,
        } satisfies ContentAssetView,
      })),
      ...manifest.faqs.map((item) => ({
        kind: 'faq' as const,
        value: {
          id: importedId('faq', key, item.externalId),
          externalId: item.externalId,
          ...(item.productSku ? { productSku: item.productSku } : {}),
          question: item.question,
          answer: item.answer,
          status: 'draft',
          provenanceKey: key,
          operatorEdited: false,
        } satisfies FaqView,
      })),
      ...manifest.advice.map((item) => ({
        kind: 'advice' as const,
        value: {
          id: importedId('advice', key, item.externalId),
          externalId: item.externalId,
          ...(item.productSku ? { productSku: item.productSku } : {}),
          title: item.title,
          body: item.body,
          status: 'draft',
          provenanceKey: key,
          operatorEdited: false,
        } satisfies AdviceContentView,
      })),
      ...manifest.links.map((item) => ({
        kind: 'link' as const,
        value: {
          id: importedId('link', key, item.externalId),
          externalId: item.externalId,
          ...(item.productSku ? { productSku: item.productSku } : {}),
          kind: item.kind,
          title: item.title,
          url: item.url,
          status: 'draft',
          provenanceKey: key,
          operatorEdited: false,
        } satisfies ContentLinkView,
      })),
    ];
    const existing = new Map(
      [
        ...snapshot.assets.map((value) => ({ kind: 'asset' as const, value })),
        ...snapshot.faqs.map((value) => ({ kind: 'faq' as const, value })),
        ...snapshot.advice.map((value) => ({ kind: 'advice' as const, value })),
        ...snapshot.links.map((value) => ({ kind: 'link' as const, value })),
      ].map((item) => [
        `${item.kind}:${item.value.provenanceKey ?? 'operator'}:${item.value.externalId}`,
        item.value,
      ]),
    );
    return records.map((item) => {
      const old = existing.get(
        `${item.kind}:${item.value.provenanceKey ?? 'operator'}:${item.value.externalId}`,
      );
      if (!old) return { ...item, state: 'create' };
      const value = { ...item.value, id: old.id } as ContentRecord;
      if (old.operatorEdited && !sameRecord(old, value))
        return { ...item, value, state: 'conflict' };
      return { ...item, value, state: sameRecord(old, value) ? 'unchanged' : 'update' };
    });
  }

  private async validateProductMappings(manifest: ContentImportManifest): Promise<string[]> {
    const known = new Set(await this.repo.productSkus());
    const referenced = new Set([
      ...manifest.assets.flatMap((asset) => asset.productSkus),
      ...manifest.faqs.flatMap((faq) => (faq.productSku ? [faq.productSku] : [])),
      ...manifest.advice.flatMap((item) => (item.productSku ? [item.productSku] : [])),
      ...manifest.links.flatMap((link) => (link.productSku ? [link.productSku] : [])),
    ]);
    return [...referenced]
      .filter((sku) => !known.has(sku))
      .map((sku) => `SKU không tồn tại: ${sku}`);
  }
}

function provenanceFrom(manifest: ContentImportManifest): ContentProvenanceView {
  const source = manifest.source;
  return {
    id: `${source.kind}:${source.sourceId}`,
    kind: source.kind,
    sourceId: source.sourceId,
    ...(source.locator ? { locator: source.locator } : {}),
    ...(source.hash ? { hash: source.hash } : {}),
    ...(source.version ? { version: source.version } : {}),
    importedAt: new Date().toISOString(),
  };
}

function summarize(planned: Planned[]): ContentImportPreview {
  return {
    creates: planned.filter((item) => item.state === 'create').length,
    updates: planned.filter((item) => item.state === 'update').length,
    unchanged: planned.filter((item) => item.state === 'unchanged').length,
    conflicts: planned.filter((item) => item.state === 'conflict').length,
    errors: [],
  };
}

function sameRecord(a: ContentRecord, b: ContentRecord): boolean {
  const strip = (value: ContentRecord): object => {
    const { operatorEdited: _operatorEdited, ...record } = value;
    return record;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
