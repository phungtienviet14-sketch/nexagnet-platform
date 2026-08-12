import type {
  AdviceContentView,
  ContentAssetView,
  ContentLinkView,
  ContentProvenanceView,
  ContentReadinessView,
  ContentSnapshotView,
  FaqView,
} from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';
import {
  ContentRepository,
  type ContentEntityKind,
  type ContentRecord,
} from './content.repository.js';

export class PrismaContentRepository extends ContentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async snapshot(): Promise<ContentSnapshotView> {
    const [provenance, assets, faqs, advice, links, readiness] = await Promise.all([
      this.prisma.sourceProvenance.findMany({ orderBy: { importedAt: 'desc' } }),
      this.prisma.asset.findMany({ include: { products: true }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.fAQ.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.adviceContent.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.contentLink.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.contentReadiness.findMany({ orderBy: { key: 'asc' } }),
    ]);
    return {
      provenance: provenance.map((row) => ({
        id: row.id,
        kind: row.kind,
        sourceId: row.sourceId,
        ...(row.locator ? { locator: row.locator } : {}),
        ...(row.hash ? { hash: row.hash } : {}),
        ...(row.version ? { version: row.version } : {}),
        importedAt: row.importedAt.toISOString(),
      })),
      assets: assets.map((row) => ({
        id: row.id,
        externalId: row.externalId,
        kind: row.kind,
        ...(row.title ? { title: row.title } : {}),
        locator: row.locator,
        ...(row.mimeType ? { mimeType: row.mimeType } : {}),
        source: row.source,
        ...(row.sourceFileId ? { sourceFileId: row.sourceFileId } : {}),
        ...(row.hash ? { hash: row.hash } : {}),
        ...(row.version ? { version: row.version } : {}),
        status: row.status,
        productSkus: row.products.map((item) => item.productSku),
        ...(row.provenanceId ? { provenanceKey: row.provenanceId } : {}),
        operatorEdited: row.operatorEdited,
      })),
      faqs: faqs.map(mapFaq),
      advice: advice.map((row) => ({
        id: row.id,
        externalId: row.externalId,
        ...(row.productSku ? { productSku: row.productSku } : {}),
        title: row.title,
        body: row.body,
        status: row.status,
        ...(row.provenanceId ? { provenanceKey: row.provenanceId } : {}),
        operatorEdited: row.operatorEdited,
      })),
      links: links.map((row) => ({
        id: row.id,
        externalId: row.externalId,
        ...(row.productSku ? { productSku: row.productSku } : {}),
        kind: row.kind,
        title: row.title,
        url: row.url,
        status: row.status,
        ...(row.provenanceId ? { provenanceKey: row.provenanceId } : {}),
        operatorEdited: row.operatorEdited,
      })),
      readiness: readiness.map((row) => ({
        ...(row.productSku ? { productSku: row.productSku } : {}),
        ready: row.ready,
        missing: row.missing,
      })),
    };
  }

  async productSkus(): Promise<string[]> {
    return (
      await this.prisma.product.findMany({ select: { sku: true }, orderBy: { sku: 'asc' } })
    ).map((product) => product.sku);
  }

  async saveProvenance(value: ContentProvenanceView): Promise<void> {
    await this.prisma.sourceProvenance.upsert({
      where: { id: value.id },
      create: {
        id: value.id,
        kind: value.kind,
        sourceId: value.sourceId,
        locator: value.locator,
        hash: value.hash,
        version: value.version,
      },
      update: {
        locator: value.locator,
        hash: value.hash,
        version: value.version,
        importedAt: new Date(),
      },
    });
  }

  async upsert(kind: ContentEntityKind, value: ContentRecord): Promise<void> {
    if (kind === 'asset') return this.upsertAsset(value as ContentAssetView);
    if (kind === 'faq') return this.upsertFaq(value as FaqView);
    if (kind === 'advice') return this.upsertAdvice(value as AdviceContentView);
    return this.upsertLink(value as ContentLinkView);
  }

  async setStatus(
    kind: ContentEntityKind,
    id: string,
    status: ContentRecord['status'],
    operatorEdited: boolean,
  ): Promise<ContentRecord | null> {
    const exists = await this.exists(kind, id);
    if (!exists) return null;
    if (kind === 'asset')
      await this.prisma.asset.update({ where: { id }, data: { status, operatorEdited } });
    else if (kind === 'faq')
      await this.prisma.fAQ.update({ where: { id }, data: { status, operatorEdited } });
    else if (kind === 'advice')
      await this.prisma.adviceContent.update({ where: { id }, data: { status, operatorEdited } });
    else await this.prisma.contentLink.update({ where: { id }, data: { status, operatorEdited } });
    const snapshot = await this.snapshot();
    return collection(snapshot, kind).find((item) => item.id === id) ?? null;
  }

  async setReadiness(value: ContentReadinessView): Promise<void> {
    const key = value.productSku ?? '__global__';
    await this.prisma.contentReadiness.upsert({
      where: { key },
      create: { key, productSku: value.productSku, ready: value.ready, missing: value.missing },
      update: { productSku: value.productSku, ready: value.ready, missing: value.missing },
    });
  }

  private async upsertAsset(value: ContentAssetView): Promise<void> {
    const data = {
      externalId: value.externalId,
      kind: value.kind,
      title: value.title,
      locator: value.locator,
      mimeType: value.mimeType,
      source: value.source,
      sourceFileId: value.sourceFileId,
      hash: value.hash,
      version: value.version,
      status: value.status,
      provenanceId: value.provenanceKey,
      operatorEdited: value.operatorEdited,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.upsert({
        where: { id: value.id },
        create: { id: value.id, ...data },
        update: data,
      });
      await tx.productAsset.deleteMany({ where: { assetId: value.id } });
      if (value.productSkus.length) {
        await tx.productAsset.createMany({
          data: value.productSkus.map((productSku) => ({ productSku, assetId: value.id })),
          skipDuplicates: true,
        });
      }
    });
  }

  private async upsertFaq(value: FaqView): Promise<void> {
    const data = {
      externalId: value.externalId,
      productSku: value.productSku,
      question: value.question,
      answer: value.answer,
      status: value.status,
      provenanceId: value.provenanceKey,
      operatorEdited: value.operatorEdited,
    };
    await this.prisma.fAQ.upsert({
      where: { id: value.id },
      create: { id: value.id, ...data },
      update: data,
    });
  }

  private async upsertAdvice(value: AdviceContentView): Promise<void> {
    const data = {
      externalId: value.externalId,
      productSku: value.productSku,
      title: value.title,
      body: value.body,
      status: value.status,
      provenanceId: value.provenanceKey,
      operatorEdited: value.operatorEdited,
    };
    await this.prisma.adviceContent.upsert({
      where: { id: value.id },
      create: { id: value.id, ...data },
      update: data,
    });
  }

  private async upsertLink(value: ContentLinkView): Promise<void> {
    const data = {
      externalId: value.externalId,
      productSku: value.productSku,
      kind: value.kind,
      title: value.title,
      url: value.url,
      status: value.status,
      provenanceId: value.provenanceKey,
      operatorEdited: value.operatorEdited,
    };
    await this.prisma.contentLink.upsert({
      where: { id: value.id },
      create: { id: value.id, ...data },
      update: data,
    });
  }

  private async exists(kind: ContentEntityKind, id: string): Promise<boolean> {
    if (kind === 'asset')
      return Boolean(await this.prisma.asset.findUnique({ where: { id }, select: { id: true } }));
    if (kind === 'faq')
      return Boolean(await this.prisma.fAQ.findUnique({ where: { id }, select: { id: true } }));
    if (kind === 'advice')
      return Boolean(
        await this.prisma.adviceContent.findUnique({ where: { id }, select: { id: true } }),
      );
    return Boolean(
      await this.prisma.contentLink.findUnique({ where: { id }, select: { id: true } }),
    );
  }
}

function mapFaq(row: {
  id: string;
  externalId: string;
  productSku: string | null;
  question: string;
  answer: string;
  status: FaqView['status'];
  provenanceId: string | null;
  operatorEdited: boolean;
}): FaqView {
  return {
    id: row.id,
    externalId: row.externalId,
    ...(row.productSku ? { productSku: row.productSku } : {}),
    question: row.question,
    answer: row.answer,
    status: row.status,
    ...(row.provenanceId ? { provenanceKey: row.provenanceId } : {}),
    operatorEdited: row.operatorEdited,
  };
}

function collection(snapshot: ContentSnapshotView, kind: ContentEntityKind): ContentRecord[] {
  if (kind === 'asset') return snapshot.assets;
  if (kind === 'faq') return snapshot.faqs;
  if (kind === 'advice') return snapshot.advice;
  return snapshot.links;
}
