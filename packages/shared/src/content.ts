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

/**
 * Toi da bao nhieu anh duoc dinh kem MOT luot tu van (chot 15/08/2026: 3).
 * Bot Platform khong co "send album" — moi anh la mot request — nen con so nay cung la so request
 * ban vao rate limit cua nhom. Ba anh du thay san pham ma chua bi coi la spam.
 */
export const MAX_OUTBOUND_IMAGES = 3;

export const outboundContentSchema = z
  .object({
    text: z.string().trim().min(1).max(20_000),
    /**
     * Anh san pham dinh kem. Truoc 15/08/2026 day la MOT anh (`image`) va `ContentService` chon
     * bang `.find()` — tuc khach chi nhan duoc dung 1 tam du goi khach co ca bo anh. Tai lieu
     * khach (muc 1.1) yeu cau "Hinh anh" cho TUNG san pham, so nhieu.
     */
    images: z
      .array(
        z
          .object({
            url: z.string().url().max(2_000),
            alt: z.string().trim().max(500).optional(),
          })
          .strict(),
      )
      .max(MAX_OUTBOUND_IMAGES)
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

/**
 * Nang luc gui THAT cua tung kenh. `video`/`file` truoc 15/08/2026 la literal `false`, tuc he
 * thong kieu CAM vinh vien viec khai bao mot kenh gui duoc video — ke ca khi kenh do lam duoc.
 * Gio la `boolean`: Bot Platform van khai `false` (sendVideo/sendFile tra 404, da xac minh
 * 11/08/2026), rieng zca gui duoc attachment nen duoc quyen khai `true`.
 */
export interface ChannelCapabilities {
  text: true;
  image: boolean;
  video: boolean;
  file: boolean;
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
  /**
   * Cac manh FAQ/advice DA DUYET da duoc chon, giu rieng tung manh (chua noi chuoi). `text` la ban
   * noi nguyen van dung lam FALLBACK; `AdviceComposer` doc `snippets` de soan lai cho tu nhien.
   * Tach hai thu ra vi ban soan co the that bai — luc do van con ban tra bang de gui.
   */
  snippets?: { question?: string; body: string }[];
  /** Ten san pham da nhan dien — de ban soan goi dung ten, khong tu dat ten khac. */
  productNames?: string[];
}
