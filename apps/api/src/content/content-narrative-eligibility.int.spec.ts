import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaContentRepository } from './prisma-content.repository.js';

/**
 * LOP THAM QUYEN CUA MOT BAN GHI NOI DUNG, TREN POSTGRES THAT (Issue #205, muc 9 + muc 10).
 *
 * Bo in-memory chung minh QUY TAC ("vang mat = tu choi"). Bo nay chung minh cai ma quy tac do
 * dua vao: cot moi ton tai, migration ap duoc, va — quan trong nhat — GIA TRI SONG QUA MOT LAN
 * DUNG KET NOI. Voi `PERSISTENCE=prisma` thi sau lan seed dau tien Postgres moi la nguon su that,
 * nen mot tuyen bo chi song trong bo nho la mot tuyen bo se bien mat sau lan restart dau tien.
 *
 * BAT BIEN DUOC KHOA O DAY: `NULL` doc len thanh TRUONG VANG MAT tren view, khong thanh `false`.
 * Hai gia tri do doi hai hanh dong khac nhau tu nguoi van hanh ("chua ai xet" va "da xet, tu
 * choi"), va bao cao mat mat nang luc phai dem duoc chung rieng ra. Ca hai deu KHONG ke duoc.
 *
 * `describe.runIf` theo quy uoc repo: khong co DB thi bo qua thay vi do; chung chay o job
 * `integration` cua CI.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Quyen ke lai cua ban ghi noi dung (Postgres THAT)',
  () => {
    const prisma = new PrismaService();
    const repository = new PrismaContentRepository(prisma);

    /*
     * TIEN TO KHONG DUOC LONG NHAU: phep don dep dung `startsWith`, nen mot tien to la tien to cua
     * cai kia se lam bai chay rieng thi XANH ma chay ca thu muc moi lo.
     */
    const PREFIX = 'it-nar-elig-';
    const PROVENANCE = `${PREFIX}src`;

    async function cleanup(): Promise<void> {
      // Gioi han dung ban ghi cua bai test — DB nay co the dang chua du lieu that.
      await prisma.fAQ.deleteMany({ where: { id: { startsWith: PREFIX } } });
      await prisma.adviceContent.deleteMany({ where: { id: { startsWith: PREFIX } } });
      await prisma.sourceProvenance.deleteMany({ where: { id: { startsWith: PREFIX } } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.sourceProvenance.create({
        data: { id: PROVENANCE, kind: 'local_manifest', sourceId: `${PREFIX}manifest` },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    const faq = (
      suffix: string,
      narrativeEligible: boolean | undefined,
    ): Parameters<typeof repository.upsert>[1] => ({
      id: `${PREFIX}${suffix}`,
      externalId: `${PREFIX}${suffix}`,
      question: `Cau hoi ${suffix}?`,
      answer: `Tra loi ${suffix}.`,
      status: 'active' as const,
      ...(narrativeEligible === undefined ? {} : { narrativeEligible }),
      provenanceKey: PROVENANCE,
      operatorEdited: false,
    });

    it('ban ghi KHONG tuyen bo -> doc lai la truong VANG MAT, khong phai `false`', async () => {
      await repository.upsert('faq', faq('silent', undefined));
      const snapshot = await repository.snapshot();
      const row = snapshot.faqs.find((item) => item.id === `${PREFIX}silent`);

      expect(row).toBeDefined();
      expect(row).not.toHaveProperty('narrativeEligible');
    });

    it('tuyen bo `true` song qua mot lan doc lai tu DB', async () => {
      await repository.upsert('faq', faq('tellable', true));
      const snapshot = await repository.snapshot();

      expect(snapshot.faqs.find((item) => item.id === `${PREFIX}tellable`)).toMatchObject({
        narrativeEligible: true,
      });
    });

    it('tuyen bo `false` cung song, va no KHAC voi vang mat', async () => {
      await repository.upsert('faq', faq('refused', false));
      const snapshot = await repository.snapshot();

      expect(snapshot.faqs.find((item) => item.id === `${PREFIX}refused`)).toMatchObject({
        narrativeEligible: false,
      });
    });

    /*
     * RUT QUYEN KE PHAI GHI DUOC XUONG DB.
     *
     * Day la duong ma muc 8 ca 10 hop dong dua vao: mot ban ghi bi rut quyen roi thi ban soan cu
     * dang nam trong hang cho cua Sale phai dung lai o diem nghen gui. Neu phep rut chi song
     * trong bo nho thi lan restart ke tiep se am tham cap phep lai.
     */
    it('rut quyen ke ghi de duoc len ban ghi da tuyen bo', async () => {
      await repository.upsert('faq', faq('revoked', true));
      await repository.upsert('faq', faq('revoked', false));
      const snapshot = await repository.snapshot();

      expect(snapshot.faqs.find((item) => item.id === `${PREFIX}revoked`)).toMatchObject({
        narrativeEligible: false,
      });
    });

    it('bai tu van cung mang duoc lop tham quyen', async () => {
      await repository.upsert('advice', {
        id: `${PREFIX}advice`,
        externalId: `${PREFIX}advice`,
        title: 'Bai tu van test',
        body: 'Noi dung bai tu van test.',
        status: 'active',
        narrativeEligible: true,
        provenanceKey: PROVENANCE,
        operatorEdited: false,
      });
      const snapshot = await repository.snapshot();

      expect(snapshot.advice.find((item) => item.id === `${PREFIX}advice`)).toMatchObject({
        narrativeEligible: true,
      });
    });
  },
);
