import { z } from 'zod';

export const CONTENT_LIFECYCLE_STATUSES = ['draft', 'reviewed', 'approved', 'active'] as const;
export const ASSET_KINDS = ['image', 'video', 'pdf', 'catalog', 'company_profile'] as const;
export const CONTENT_LINK_KINDS = ['video', 'catalog', 'company_profile'] as const;
export const CONTENT_SOURCE_KINDS = [
  'local_manifest',
  'google_drive',
  'object_storage',
  'operator',
] as const;

export const contentLifecycleStatusSchema = z.enum(CONTENT_LIFECYCLE_STATUSES);
export const assetKindSchema = z.enum(ASSET_KINDS);
export const contentLinkKindSchema = z.enum(CONTENT_LINK_KINDS);
export const contentSourceKindSchema = z.enum(CONTENT_SOURCE_KINDS);

const importedBaseSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  status: contentLifecycleStatusSchema.default('draft'),
});

export const contentImportManifestSchema = z
  .object({
    source: z
      .object({
        kind: contentSourceKindSchema,
        sourceId: z.string().trim().min(1).max(500),
        locator: z.string().trim().max(2_000).optional(),
        version: z.string().trim().max(200).optional(),
        hash: z.string().trim().max(256).optional(),
      })
      .strict(),
    assets: z
      .array(
        importedBaseSchema
          .extend({
            kind: assetKindSchema,
            title: z.string().trim().max(500).optional(),
            locator: z.string().trim().url().max(2_000),
            mimeType: z.string().trim().max(200).optional(),
            sourceFileId: z.string().trim().max(500).optional(),
            hash: z.string().trim().max(256).optional(),
            version: z.string().trim().max(200).optional(),
            productSkus: z.array(z.string().trim().min(1).max(100)).max(1_000).default([]),
          })
          .strict(),
      )
      .max(10_000)
      .default([]),
    faqs: z
      .array(
        importedBaseSchema
          .extend({
            productSku: z.string().trim().min(1).max(100).optional(),
            question: z.string().trim().min(1).max(2_000),
            answer: z.string().trim().min(1).max(20_000),
          })
          .strict(),
      )
      .max(10_000)
      .default([]),
    advice: z
      .array(
        importedBaseSchema
          .extend({
            productSku: z.string().trim().min(1).max(100).optional(),
            title: z.string().trim().min(1).max(500),
            body: z.string().trim().min(1).max(20_000),
          })
          .strict(),
      )
      .max(10_000)
      .default([]),
    links: z
      .array(
        importedBaseSchema
          .extend({
            productSku: z.string().trim().min(1).max(100).optional(),
            kind: contentLinkKindSchema,
            title: z.string().trim().min(1).max(500),
            url: z.string().trim().url().max(2_000),
          })
          .strict(),
      )
      .max(10_000)
      .default([]),
  })
  .strict();

export const outboundContentSchema = z
  .object({
    text: z.string().trim().min(1).max(20_000),
    image: z
      .object({
        url: z.string().url().max(2_000),
        alt: z.string().trim().max(500).optional(),
      })
      .strict()
      .optional(),
    links: z
      .array(
        z
          .object({
            kind: contentLinkKindSchema,
            label: z.string().trim().min(1).max(500),
            url: z.string().url().max(2_000),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

export type ContentLifecycleStatus = z.infer<typeof contentLifecycleStatusSchema>;
export type AssetKind = z.infer<typeof assetKindSchema>;
export type ContentLinkKind = z.infer<typeof contentLinkKindSchema>;
export type ContentSourceKind = z.infer<typeof contentSourceKindSchema>;
export type ContentImportManifest = z.infer<typeof contentImportManifestSchema>;
export type OutboundContent = z.infer<typeof outboundContentSchema>;

export interface ChannelCapabilities {
  text: true;
  image: boolean;
  video: false;
  file: false;
}

export interface ContentProvenanceView {
  id: string;
  kind: ContentSourceKind;
  sourceId: string;
  locator?: string;
  hash?: string;
  version?: string;
  importedAt?: string;
}

export interface ContentAssetView {
  id: string;
  externalId: string;
  kind: AssetKind;
  title?: string;
  locator: string;
  mimeType?: string;
  source: ContentSourceKind;
  sourceFileId?: string;
  hash?: string;
  version?: string;
  status: ContentLifecycleStatus;
  productSkus: string[];
  provenanceKey?: string;
  operatorEdited: boolean;
}

export interface FaqView {
  id: string;
  externalId: string;
  productSku?: string;
  question: string;
  answer: string;
  status: ContentLifecycleStatus;
  provenanceKey?: string;
  operatorEdited: boolean;
}

export interface AdviceContentView {
  id: string;
  externalId: string;
  productSku?: string;
  title: string;
  body: string;
  status: ContentLifecycleStatus;
  provenanceKey?: string;
  operatorEdited: boolean;
}

export interface ContentLinkView {
  id: string;
  externalId: string;
  productSku?: string;
  kind: ContentLinkKind;
  title: string;
  url: string;
  status: ContentLifecycleStatus;
  provenanceKey?: string;
  operatorEdited: boolean;
}

export interface ContentReadinessView {
  productSku?: string;
  ready: boolean;
  missing: string[];
}

export interface ContentSnapshotView {
  provenance: ContentProvenanceView[];
  assets: ContentAssetView[];
  faqs: FaqView[];
  advice: AdviceContentView[];
  links: ContentLinkView[];
  readiness: ContentReadinessView[];
}

export interface ContentImportPreview {
  creates: number;
  updates: number;
  unchanged: number;
  conflicts: number;
  errors: string[];
}

export interface ContentImportResult extends ContentImportPreview {
  applied: number;
  skippedConflicts: number;
}

export interface ProductAdviceResult extends OutboundContent {
  ready: boolean;
  productSkus: string[];
  missing: string[];
}
