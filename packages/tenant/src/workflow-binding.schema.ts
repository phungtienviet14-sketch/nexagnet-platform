import { z } from 'zod';

/**
 * RANG BUOC WORKFLOW THEO GOI KHACH.
 *
 * Cau hoi ma file nay tra loi: "khach thu ba cau hinh gi de dung duoc cung mot khuon workflow?"
 * Cau tra loi phai la MOT KHOI JSON, khong phai mot ban fork code.
 *
 * ---------------------------------------------------------------------------
 * BA THU TUYET DOI KHONG DUOC NAM O DAY (goi khach nam trong git):
 *
 *   · code workflow          — khuon nghiep vu la CODE, duoc review va version. Dashboard de
 *                              QUAN SAT/VAN HANH; git de DINH NGHIA.
 *   · bi mat                 — `credentialRef` la TEN BIEN MOI TRUONG, khong phai gia tri.
 *                              Schema tu choi moi chuoi khong phai dang TEN_BIEN.
 *   · endpoint/credential tho — dich den la mot CAI TEN logic (`erp-primary`); anh xa ten do
 *                              sang URL/khoa nam o cau hinh runtime, khong o day.
 *
 * Tach thanh file rieng (khong nhet thang vao `tenant.schema.ts`) vi hai ly do: file kia da
 * ~460 dong, va khoi nay co bo luat rang buoc cheo rieng du lon de doc doc lap.
 */

/** Nha cung cap engine. Khop `WORKFLOW_ENGINE_NAMES` cua `apps/api/src/workflow`. */
export const WORKFLOW_ENGINE_ADAPTERS = ['none', 'hatchet'] as const;
export const workflowEngineAdapterSchema = z.enum(WORKFLOW_ENGINE_ADAPTERS);

/**
 * Muc ho tro idempotency cua DICH DEN. Day la thuoc tinh cua he ngoai, khong phai cua ta —
 * nen no phai duoc KHAI BAO, khong duoc doan.
 *
 *   'key'    nhan khoa idempotency, tu chong trung   -> replay an toan tu dong
 *   'lookup' tra cuu duoc nhung khong nhan khoa      -> replay phai doi soat truoc
 *   'none'   khong co gi                             -> replay BI CHAN
 */
export const idempotencySupportSchema = z.enum(['key', 'lookup', 'none']);

/** Khoa/dich den: chu thuong, so, gach noi. Dung duoc lam ten workflow cua engine. */
const slugLike = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'chi chu thuong, so va gach noi')
  .max(64);

/**
 * Phien ban khuon workflow dang HOAT DONG cho khach nay.
 *
 * `latest` bi cam co chu dich: mot ten tro toi "ban moi nhat" pha chinh co che ghim phien ban
 * ma GATE A xac lap — run cu se bi ban trien khai moi cuop mat.
 */
const workflowVersion = z
  .string()
  .regex(/^v[1-9][0-9]*$/, "phien ban phai dang 'v1', 'v2'… (khong dung 'latest')");

export const workflowBindingSchema = z
  .object({
    /** Khoa ON DINH cua khuon workflow trong code — khong doi khi len phien ban. */
    key: slugLike,
    version: workflowVersion,
    /** Tat mot rang buoc KHONG xoa no: giu cau hinh de bat lai sau ma khong phai go lai. */
    enabled: z.boolean(),
    /** Dich den LOGIC. Mot cai ten, khong phai URL va khong phai credential. */
    destination: slugLike,
    idempotency: idempotencySupportSchema,
    /**
     * Phien ban Y NGHIA cua thao tac (xem `operation-key.ts`). Tang khi thao tac doi nghia,
     * KHONG tang khi chi deploy code moi.
     */
    operationVersion: z.number().int().positive().max(1_000),
    retry: z
      .object({
        maxAttempts: z.number().int().positive().max(20),
        baseBackoffSeconds: z.number().int().positive().max(86_400),
      })
      .strict(),
  })
  .strict();

export type WorkflowBinding = z.infer<typeof workflowBindingSchema>;

/**
 * TEN bien moi truong chua token — khong phai gia tri.
 *
 * Regex nay la LOP CHAN CUOI truoc khi mot bi mat bi commit vao git cung goi khach: mot JWT
 * (`eyJ…`) hay khoa dang `sk-ant-…` deu khong khop `^[A-Z][A-Z0-9_]*$`, nen chung khong the
 * nam o day ngay ca khi ai do dan nham.
 */
const credentialRefSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'phai la TEN bien moi truong (VD: WORKFLOW_ENGINE_TOKEN)')
  .max(100);

export const workflowEngineIntegrationSchema = z
  .object({
    adapter: workflowEngineAdapterSchema,
    credentialRef: credentialRefSchema.optional(),
    bindings: z.array(workflowBindingSchema).max(50).default([]),
  })
  .strict()
  .superRefine((integration, ctx) => {
    if (integration.adapter !== 'none' && !integration.credentialRef) {
      ctx.addIssue({
        code: 'custom',
        path: ['credentialRef'],
        message: `adapter '${integration.adapter}' yeu cau credentialRef (ten bien moi truong chua token)`,
      });
    }

    // Cau hinh TU MAU THUAN: khai la khong dung engine nhung van bat mot rang buoc. De lot thi
    // luc chay se co mot viec "da duoc giao" ma khong engine nao nhan — hong am tham.
    if (integration.adapter === 'none') {
      for (const [index, binding] of integration.bindings.entries()) {
        if (binding.enabled) {
          ctx.addIssue({
            code: 'custom',
            path: ['bindings', index, 'enabled'],
            message: `rang buoc '${binding.key}' dang bat nhung workflowEngine.adapter=none`,
          });
        }
      }
    }

    const seen = new Set<string>();
    for (const [index, binding] of integration.bindings.entries()) {
      if (seen.has(binding.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['bindings', index, 'key'],
          message: `rang buoc trung khoa '${binding.key}' — khong xac dinh duoc cai nao thang`,
        });
      }
      seen.add(binding.key);
    }
  });

export type WorkflowEngineIntegration = z.infer<typeof workflowEngineIntegrationSchema>;
export type WorkflowEngineAdapterName = z.infer<typeof workflowEngineAdapterSchema>;
export type IdempotencySupport = z.infer<typeof idempotencySupportSchema>;

/** Mac dinh cua nen tang: khach chua khai bao gi thi KHONG co engine. Fail-closed. */
export const NO_WORKFLOW_ENGINE: WorkflowEngineIntegration = { adapter: 'none', bindings: [] };
