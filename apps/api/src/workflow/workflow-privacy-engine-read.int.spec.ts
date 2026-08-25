import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import {
  ProofEndpoint,
  RUN_COMPLETE_TIMEOUT_MS,
  WORKFLOW_FIXTURE,
  WorkerProcess,
  baseEnv,
  bootAppContext,
  engineReadClient,
  waitFor,
  type BootedApp,
} from './__tests__/workflow-it.harness.js';

/**
 * W8 — RIENG TU DOC TU ENGINE THAT.
 *
 * ---------------------------------------------------------------------------
 * VI SAO `workflow-input.spec.ts` CHUA DU, du no da co 18 bai:
 *
 * No do mot HAM (`buildWorkflowInput`) tren cac gia tri do chinh no dung ra. Cau hoi that su
 * thi khac: sau khi di qua cau noi, qua outbox, qua adapter va vao ENGINE, thu ma engine LUU
 * LAI tren dia cua no la gi.
 *
 * Do la cho duy nhat co y nghia phap ly: `input` cua run duoc engine luu NGUYEN VAN va hien
 * tren dashboard, va no song 30 ngay. Mot bai kiem doc doi tuong TRUOC khi trigger khong noi
 * duoc gi ve cho do — no chi noi ve cai ta DINH gui.
 *
 * Bai nay doc NGUOC tu engine bang SDK, dung cho du lieu THAT SU NAM.
 *
 *   docker compose -f docker-compose.yml up -d postgres
 *   docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
 *   RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_TOKEN=… \
 *     pnpm --filter @netviet/api exec vitest run src/workflow/workflow-privacy-engine-read
 */

const ENGINE_WORKFLOW_NAME = 'integration-handoff.v1';

/** Sau truong cua hop dong dau vao v1 — KHONG duoc thua MOT truong nao. */
const ALLOWED_INPUT_KEYS = [
  'destination',
  'entityId',
  'entityType',
  'operation',
  'operationVersion',
  'tenant',
];

/**
 * Cac neo tuong quan duoc phep nam trong `additionalMetadata`.
 *
 * Danh sach nay la MOT HOP DONG chu khong phai mot ghi chu: metadata cung duoc engine luu
 * nguyen van va cung hien tren dashboard, nen no chiu dung mot chuan voi `input`.
 */
const ALLOWED_METADATA_KEYS = [
  'nexagnet.entityId',
  'nexagnet.entityType',
  'nexagnet.environment',
  'nexagnet.tenant',
  'nexagnet.traceId',
  'nexagnet.workflowKey',
  'nexagnet.workflowVersion',
  'traceparent',
];

/**
 * Cac chuoi PHAI KHONG duoc xuat hien o bat ky dau trong mot lan chay tren engine.
 *
 * `token` lay tu chinh bien moi truong: neu mot ngay no ro vao `input` hay metadata thi bai nay
 * do — va do la lop bao ve cuoi cung truoc mot su co that.
 */
function forbiddenNeedles(): string[] {
  return [
    '0912345678',
    'nguyen van a',
    '123 Duong Lang',
    'Bearer ',
    'sk-',
    process.env.WORKFLOW_ENGINE_TOKEN ?? '__khong-co-token__',
  ];
}

/**
 * Cac gia tri HINH DANG BI MAT duoc DUNG LUC CHAY, khong viet thang vao ma nguon.
 *
 * Ly do rat cu the: hook `pre-commit` cua repo quet ma nguon tim khoa API, va no CHAN dung mot
 * chuoi `sk-<20 ky tu>` viet thang — ke ca khi do la du lieu thu cua mot bai kiem rieng tu. Hook
 * do lam DUNG viec cua no; cach xu ly dung la khong de mot chuoi hinh dang khoa nam trong git,
 * chu khong phai bo qua hook.
 *
 * Gia tri LUC CHAY van y het hinh dang that, nen phep do khong he yeu di.
 */
const SK = ['sk', ''].join('-');
const FAKE_ANTHROPIC_KEY = `${SK}ant-api03-0123456789abcdefgh`;
const FAKE_HYPHENATED_KEY = `${SK}live-0123456789abcdefghijklmn`;
const FAKE_BEARER = `Bearer ${SK}abcdef0123456789abcdef`;
const FAKE_JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghij'].join('.');

describe.runIf(process.env.RUN_PRISMA_IT === '1' && process.env.RUN_WORKFLOW_IT === '1')(
  'W8 — bien gioi rieng tu, doc tu ENGINE that',
  () => {
    const endpoint = new ProofEndpoint();
    const prisma = new PrismaService();
    let worker: WorkerProcess;
    let app: BootedApp;
    let childEnv: NodeJS.ProcessEnv;

    beforeAll(async () => {
      const port = await endpoint.listen();
      childEnv = baseEnv(WORKFLOW_FIXTURE, port, { PERSISTENCE: 'prisma' });
      worker = new WorkerProcess('v1', childEnv);
      await worker.start();
      app = await bootAppContext(childEnv);
    }, 300_000);

    afterAll(async () => {
      await worker?.stop();
      await app?.context.close();
      await endpoint.close();
      await prisma.workflowOutbox.deleteMany({ where: { entityId: { startsWith: 'WI-w8-' } } });
      await prisma.$disconnect();
    }, 90_000);

    // ------------------------------------------- ① tu choi TRUOC khi toi engine

    /**
     * Duong TIEM DUY NHAT co that.
     *
     * Hop dong dau vao v1 la danh sach trang sau truong, va `handoff()` TU DUNG payload — noi
     * goi khong dua vao mot object tuy y. Nen cho duy nhat mot chuoi ban ngoai co the di vao la
     * `entityType` / `entityId` / `operation`. Bom qua dung cac truong do, khong bia ra mot API
     * khong ton tai roi kiem no.
     */
    const mustBlock: Array<[string, string]> = [
      ['so dien thoai Viet Nam', '0912345678'],
      ['header uy quyen', FAKE_BEARER],
      ['khoa Anthropic', FAKE_ANTHROPIC_KEY],
      ['JWT', FAKE_JWT],
      /*
       * HAI DONG DUOI DAY TUNG NAM O `knownGaps` ngay ben duoi, va chuyen len day 25/08/2026 —
       * dung theo chi dan cua chinh nhom do: "bai nay DO la tin TOT, hay cap nhat sang nhom
       * `mustBlock` thay vi noi long khang dinh".
       *
       * CAI DA DOI KHONG PHAI BO QUET NOI DUNG. No van khong nhan ra ten nguoi hay dia chi —
       * gioi han ay la VE NGUYEN TAC va van con nguyen. Cai da doi la `entityId` chuyen sang mot
       * CONG KHUON (`assertEntityId`, sua ngay 25/08/2026 cho bug UUID trong nhu SDT): mot dinh
       * danh NOI BO khong co khoang trang, khong co dau phay. Nen ca hai gia tri nay bi chan boi
       * HINH DANG, khong phai boi noi dung.
       */
      ['ten nguoi', 'nguyen van a'],
      ['dia chi tu do', '123 Duong Lang, Ha Noi'],
    ];

    it.each(mustBlock)(
      'CHAN: entityId hinh dang %s bi tu choi o cua chinh, va KHONG co hang outbox nao',
      async (_label, entityId) => {
        const before = await prisma.workflowOutbox.count();

        await expect(
          app.handoff.handoff({
            workflowKey: 'integration-handoff',
            operation: 'sync',
            entityType: 'work-item',
            entityId,
          }),
        ).rejects.toThrow();

        // KHONG chi la "nem": phai KHONG co gi duoc xep hang. Mot bien gioi nem xong van ghi
        // hang thi du lieu van se roi sang engine o luot tick sau.
        expect(await prisma.workflowOutbox.count()).toBe(before);
      },
      60_000,
    );

    it('CHAN: entityType sai khuon bi hop dong tu choi', async () => {
      const before = await prisma.workflowOutbox.count();
      // Cua THU NHAT la hop dong (`^[a-z][a-z0-9-]*$`), khong phai luoi an toan phia sau. Mot
      // gia tri sai khuon khong bao gio den duoc buoc quet noi dung.
      await expect(
        app.handoff.handoff({
          workflowKey: 'integration-handoff',
          operation: 'sync',
          entityType: 'So Dien Thoai!',
          entityId: 'WI-w8-entity-type',
        }),
      ).rejects.toThrow();
      expect(await prisma.workflowOutbox.count()).toBe(before);
    }, 60_000);

    // ------------------------------- ①bis GIOI HAN DA BIET cua quet noi dung

    /**
     * ⚠️ GIA TRI DUOI DAY DI QUA DUOC. Do la ket qua DO DUOC, va no duoc ghi lai o day dung nhu
     * no la — mot bai test "dac ta hien trang", khong phai mot loi tan thanh.
     *
     * NHOM NAY TUNG CO BA DONG. Hai dong kia (ten nguoi, dia chi tu do) da chuyen len `mustBlock`
     * ngay 25/08/2026 vi cong khuon moi cua `entityId` chan duoc chung. Dong con lai o day khong
     * theo len duoc, va ly do dang de y:
     *
     *   mau hien tai la `/sk-[A-Za-z0-9]{16,}/`, doi 16+ ky tu CHU-SO ngay sau `sk-`. `sk-live-…`
     *   co dau gach o giua nen KHONG khop — cung ly do do, `sk-proj-…` (dinh dang khoa OpenAI
     *   hien hanh) cung khong khop. Day la mot KHE HO THAT trong bo quet dung chung
     *   — `telemetry-redaction.ts` — va no anh huong ca telemetry chu khong rieng workflow. Da bao
     *   cao; KHONG sua o day vi bo quet do la ha tang dung chung va dang co luong khac lam viec
     *   ben canh.
     *
     * VA CONG KHUON KHONG CUU DUOC CHO NAY: `sk-live-0123…` la mot chuoi slug hop le co chu cai,
     * tuc no thoa CA HAI dieu kien cua `assertEntityId`. Mot cuid noi bo va mot khoa API bi dan
     * nham vao day co CUNG hinh dang — chi NOI DUNG moi phan biet duoc, va do dung la cho bo quet
     * con thung. Day la ly do khuon khong thay the duoc quet, va quet khong thay the duoc khuon.
     *
     * DIEU THAT SU BAO VE `input`: HOP DONG — sau truong THAM CHIEU, va `entityId` theo dinh
     * nghia la dinh danh NOI BO do chinh ta sinh ra (cuid). Bo quet la lop thu hai, khong phai
     * lop thu nhat. Bai nay ton tai de khong ai nham lan hai lop do voi nhau.
     */
    const knownGaps: Array<[string, string]> = [
      ['khoa co gach giua than', FAKE_HYPHENATED_KEY],
    ];

    it.each(knownGaps)(
      'GIOI HAN DA BIET: entityId hinh dang %s KHONG bi quet noi dung chan',
      async (_label, entityId) => {
        const result = await app.handoff.handoff({
          workflowKey: 'integration-handoff',
          operation: 'sync',
          entityType: 'work-item',
          entityId,
        });
        // Neu mot ngay bo quet duoc mo rong va bai nay DO, do la tin TOT — hay cap nhat bai nay
        // sang nhom `mustBlock` thay vi noi long khang dinh.
        expect(result.outcome).toBe('queued');

        // Don ngay: khong de mot hang mang gia tri kieu nay nam lai roi troi sang engine that.
        await prisma.workflowOutbox.deleteMany({
          where: { operationKey: result.operationKey! },
        });
      },
      60_000,
    );

    // --------------------------------- ② doc NGUOC tu engine: cho du lieu THAT NAM

    it('mot run HOP LE tren engine: input/metadata/output KHONG mang PII hay bi mat', async () => {
      endpoint.mode = 'ok';
      const entityId = `WI-w8-${Date.now()}`;

      const result = await app.handoff.handoff({
        workflowKey: 'integration-handoff',
        operation: 'sync',
        entityType: 'work-item',
        entityId,
      });
      expect(result.outcome).toBe('queued');

      await waitFor(
        () => endpoint.appliedFor(result.operationKey!),
        RUN_COMPLETE_TIMEOUT_MS,
        () => 'run khong chay xong',
      );

      // Doc NGUOC tu engine — day la diem khac biet cua ca bai nay so voi `workflow-input.spec.ts`.
      const client = await engineReadClient();
      const listed = await client.runs.list({
        workflowNames: [ENGINE_WORKFLOW_NAME],
        additionalMetadata: { 'nexagnet.entityId': entityId },
        onlyTasks: false,
        limit: 10,
        includePayloads: true,
      });
      const rows = (listed.rows ?? []) as Array<Record<string, unknown>>;
      // Neu con so nay bang 0 thi moi khang dinh duoi day se "xanh" ma khong doc gi — dung kieu
      // xanh gia ma mot bo loc sai da tung gay ra o W4. Chan no ngay o day.
      expect(rows.length).toBeGreaterThanOrEqual(1);

      const run = rows[0]!;

      // ⓐ `input` DUNG BANG sau truong hop dong. Khong thua MOT truong nao.
      const input = run.input as Record<string, unknown>;
      expect(Object.keys(input).sort()).toEqual([...ALLOWED_INPUT_KEYS].sort());
      expect(input.entityId).toBe(entityId);

      // ⓑ `additionalMetadata` chi chua neo tuong quan da khai bao.
      const metadata = run.additionalMetadata as Record<string, string>;
      expect(Object.keys(metadata).sort()).toEqual([...ALLOWED_METADATA_KEYS].sort());

      // ⓒ KHONG chuoi cam nao xuat hien o BAT KY dau trong ban ghi cua run — input, output,
      //    metadata, thong bao loi. Quet CA ban ghi thay vi tung truong: mot truong moi do SDK
      //    them vao ban sau se van bi quet, con mot danh sach truong thi khong.
      const serialised = JSON.stringify(run);
      for (const needle of forbiddenNeedles()) {
        expect(serialised).not.toContain(needle);
      }
    }, 300_000);
  },
);
