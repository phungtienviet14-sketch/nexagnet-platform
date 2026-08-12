import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  contentLifecycleStatusSchema,
  type AdviceContentView,
  type ContentAssetView,
  type ContentLinkView,
  type ContentSnapshotView,
  type FaqView,
} from '@netviet/shared';
import { z } from 'zod';
import { ContentService } from './content.service.js';
import {
  ContentRepository,
  operatorId,
  type ContentEntityKind,
  type ContentRecord,
} from './content.repository.js';

const assetSchema = z.object({
  kind: z.enum(['image', 'video', 'pdf', 'catalog', 'company_profile']),
  title: z.string().trim().max(500).optional(),
  locator: z.string().trim().url().max(2_000),
  mimeType: z.string().trim().max(200).optional(),
  productSkus: z.array(z.string().trim().min(1).max(100)).max(1_000).default([]),
  status: contentLifecycleStatusSchema.default('draft'),
});
const faqSchema = z.object({
  productSku: z.string().trim().min(1).max(100).optional(),
  question: z.string().trim().min(1).max(2_000),
  answer: z.string().trim().min(1).max(20_000),
  status: contentLifecycleStatusSchema.default('draft'),
});
const adviceSchema = z.object({
  productSku: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20_000),
  status: contentLifecycleStatusSchema.default('draft'),
});
const linkSchema = z.object({
  productSku: z.string().trim().min(1).max(100).optional(),
  kind: z.enum(['video', 'catalog', 'company_profile']),
  title: z.string().trim().min(1).max(500),
  url: z.string().trim().url().max(2_000),
  status: contentLifecycleStatusSchema.default('draft'),
});

@Injectable()
export class ContentManagementService {
  constructor(
    private readonly repo: ContentRepository,
    private readonly content: ContentService,
  ) {}

  async save(kind: ContentEntityKind, input: unknown, id?: string): Promise<ContentSnapshotView> {
    const externalId = id ?? operatorId(kind);
    const value = parseRecord(kind, input, externalId);
    await this.repo.upsert(kind, value);
    return this.content.reload();
  }

  async transition(
    kind: ContentEntityKind,
    id: string,
    input: unknown,
  ): Promise<ContentSnapshotView> {
    const parsed = z.object({ status: contentLifecycleStatusSchema }).strict().safeParse(input);
    if (!parsed.success) throw new BadRequestException('Trạng thái content không hợp lệ');
    try {
      return await this.content.setStatus(kind, id, parsed.data.status);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Không tìm thấy')) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof Error && error.message.includes('Chuyển trạng thái không hợp lệ')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

function parseRecord(kind: ContentEntityKind, input: unknown, id: string): ContentRecord {
  if (kind === 'asset') {
    const parsed = assetSchema.safeParse(input);
    if (!parsed.success) throw invalid(parsed.error.issues);
    return {
      id,
      externalId: id,
      ...parsed.data,
      source: 'operator',
      operatorEdited: true,
    } satisfies ContentAssetView;
  }
  if (kind === 'faq') {
    const parsed = faqSchema.safeParse(input);
    if (!parsed.success) throw invalid(parsed.error.issues);
    return { id, externalId: id, ...parsed.data, operatorEdited: true } satisfies FaqView;
  }
  if (kind === 'advice') {
    const parsed = adviceSchema.safeParse(input);
    if (!parsed.success) throw invalid(parsed.error.issues);
    return { id, externalId: id, ...parsed.data, operatorEdited: true } satisfies AdviceContentView;
  }
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return { id, externalId: id, ...parsed.data, operatorEdited: true } satisfies ContentLinkView;
}

function invalid(issues: z.core.$ZodIssue[]): BadRequestException {
  return new BadRequestException(
    issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
  );
}
