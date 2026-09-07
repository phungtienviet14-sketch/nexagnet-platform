import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';

/**
 * C1 — DANH TINH CAY XANG TREN POSTGRES THAT (Lane C, Issue #236).
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT chu khong phai `InMemoryFuelStationRepository`
 *
 * Mot nua nhung gi C1 hua song o RANH GIOI voi CSDL, va kho trong bo nho theo dinh nghia khong co
 * ranh gioi do — no se XANH ca khi khong `CHECK` nao ton tai:
 *
 *   · muoi hai `CHECK` cua migration (toa do theo cap, ban kinh can tam, khuon khoa so khop…);
 *   · unique `(supplierId, codeNormalized)` VOI ngu nghia NULL-phan-biet cua Postgres;
 *   · unique TOAN CUC cua bi danh;
 *   · `RESTRICT` khi xoa nha cung cap ⟂ `CASCADE` khi xoa tram;
 *   · cau `OR` hai cot cua duong nhan dang.
 *
 * ===========================================================================
 * VA MOT BANG CHUNG KHAC HAN: `TX-04` CU VAN CHAY.
 *
 * Migration nay them chin cot vao `TransportFuelSupplier` — mot bang dang co du lieu that tren
 * `transport-preview/gd1-test`. Bai `C1-INT-09` doc mot hang cay xang tao bang duong CU (khong
 * biet gi ve chin cot moi) va do rang no van doc/ghi duoc, voi sieu du lieu ve RONG chu khong ve
 * `undefined`. Do la phan "khong pha T4/T7" cua muc tieu lane, do bang mot phep do chu khong bang
 * mot loi hua.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Danh tinh cay xang tren Postgres THAT — C1',
  () => {
    const prisma = new PrismaService();
    const stations = new PrismaFuelStationRepository(prisma);

    /**
     * Tien to fixture RIENG cua C1.
     *
     * KHONG duoc long nhau voi `IT-T4-CX` cua `transport-fuel.int.spec.ts`: ca hai ham don deu dung
     * `startsWith`, nen mot tien to la tien to cua cai kia se lam bai nay xoa mat fixture cua bai
     * kia — va lo ra CHI khi chay ca thu muc, khong bao gio khi chay rieng mot tep.
     */
    const SUPPLIER_CODE = 'IT-C1-CX';

    const state = { supplierId: '', otherSupplierId: '', legacySupplierId: '' };

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: SUPPLIER_CODE } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);

      const rows = await prisma.transportFuelStation.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      await prisma.transportFuelStationAlias.deleteMany({
        where: { stationId: { in: rows.map((row) => row.id) } },
      });
      await prisma.transportFuelStation.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });
    }

    beforeAll(async () => {
      await cleanup();
      const now = new Date('2026-09-08T00:00:00.000Z');
      const a = await prisma.transportFuelSupplier.create({
        data: { name: 'C1 mien Bac', code: `${SUPPLIER_CODE}-A`, createdAt: now, updatedAt: now },
      });
      const b = await prisma.transportFuelSupplier.create({
        data: { name: 'C1 mien Trung', code: `${SUPPLIER_CODE}-B`, createdAt: now, updatedAt: now },
      });
      // Hang tao bang duong CU: chi ba cot danh tinh, khong mot cot sieu du lieu nao.
      const legacy = await prisma.transportFuelSupplier.create({
        data: { name: 'C1 cu', code: `${SUPPLIER_CODE}-L`, createdAt: now, updatedAt: now },
      });
      state.supplierId = a.id;
      state.otherSupplierId = b.id;
      state.legacySupplierId = legacy.id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    const at = new Date('2026-09-08T01:00:00.000Z');

    const createStation = (over: Record<string, unknown> = {}) =>
      stations.createStation({
        supplierId: state.supplierId,
        name: 'Cua hang so 5',
        nameNormalized: 'CUA HANG SO 5',
        code: null,
        codeNormalized: null,
        address: null,
        latitudeE7: null,
        longitudeE7: null,
        geofenceRadiusM: null,
        status: 'ACTIVE',
        note: null,
        at,
        ...over,
      });

    it('C1-INT-01 — ghi va doc lai mot tram, toa do giu nguyen tung don vi 1e-7', async () => {
      const station = await createStation({
        name: 'Tram co toa do',
        nameNormalized: 'TRAM CO TOA DO',
        code: 'CH-05',
        codeNormalized: 'CH05',
        latitudeE7: 210283000,
        longitudeE7: 1058541000,
        geofenceRadiusM: 150,
      });

      const read = await stations.findStation(station.id);
      // `Int` chu khong `Float`: hai lan doc phai ra DUNG mot con so, khong lech o chu so cuoi.
      expect(read).toMatchObject({
        latitudeE7: 210283000,
        longitudeE7: 1058541000,
        geofenceRadiusM: 150,
        codeNormalized: 'CH05',
      });
    });

    it('C1-INT-02 — unique `(supplierId, codeNormalized)` co hieu luc o tang DB', async () => {
      await createStation({
        name: 'Tram A',
        nameNormalized: 'TRAM A',
        code: 'CH-09',
        codeNormalized: 'CH09',
      });
      await expect(
        createStation({
          name: 'Tram B',
          nameNormalized: 'TRAM B',
          code: 'CH 09',
          codeNormalized: 'CH09',
        }),
      ).rejects.toThrow();
    });

    /**
     * Postgres coi hai `NULL` la KHAC NHAU trong mot chi so unique, va C1 DUA VAO dieu do: phan lon
     * tram khong co ma cua hang. Neu ngu nghia nay doi (vd ai do them `NULLS NOT DISTINCT`), tram
     * thu hai khong co ma se bi tu choi — va bai nay do ngay.
     */
    it('C1-INT-03 — nhieu tram KHONG CO MA trong cung mot nha cung cap deu ghi duoc', async () => {
      const first = await createStation({ name: 'Khong ma 1', nameNormalized: 'KHONG MA 1' });
      const second = await createStation({ name: 'Khong ma 2', nameNormalized: 'KHONG MA 2' });
      expect(first.id).not.toBe(second.id);
    });

    it('C1-INT-04 — cung mot ma o hai nha cung cap khac nhau deu ghi duoc', async () => {
      await createStation({
        name: 'Tram X',
        nameNormalized: 'TRAM X',
        code: 'CH-77',
        codeNormalized: 'CH77',
      });
      const twin = await createStation({
        supplierId: state.otherSupplierId,
        name: 'Tram Y',
        nameNormalized: 'TRAM Y',
        code: 'CH-77',
        codeNormalized: 'CH77',
      });
      expect(twin.codeNormalized).toBe('CH77');
    });

    it('C1-INT-05 — bi danh unique TOAN CUC, ke ca giua hai nha cung cap', async () => {
      const mine = await createStation({ name: 'Tram bi danh', nameNormalized: 'TRAM BI DANH' });
      const theirs = await createStation({
        supplierId: state.otherSupplierId,
        name: 'Tram khac',
        nameNormalized: 'TRAM KHAC',
      });

      await stations.addAlias({
        stationId: mine.id,
        normalized: 'CHXD SO 5 HA NOI',
        raw: 'CHXD số 5 Hà Nội',
        createdBy: 'it',
        at,
      });
      await expect(
        stations.addAlias({
          stationId: theirs.id,
          normalized: 'CHXD SO 5 HA NOI',
          raw: 'chxd so 5 ha noi',
          createdBy: 'it',
          at,
        }),
      ).rejects.toThrow();
    });

    /** Muoi mot duong hong — do CHUNG BI CHAN THAT, khong chi do ten `CHECK` co trong tep SQL. */
    it.each([
      ['ten rong', { name: '   ', nameNormalized: 'TRAM A' }],
      ['khoa so khop con dau tieng Viet', { nameNormalized: 'Cửa hàng' }],
      ['khoa so khop rong', { nameNormalized: '' }],
      ['ma co ma khong co khoa', { code: 'CH-01', codeNormalized: null }],
      ['khoa co ma khong co ma', { code: null, codeNormalized: 'CH01' }],
      ['khoa ma sai khuon', { code: 'CH-01', codeNormalized: 'ch-01' }],
      ['vi do ngoai khoang', { latitudeE7: 900000001, longitudeE7: 0 }],
      ['kinh do ngoai khoang', { latitudeE7: 0, longitudeE7: 1800000001 }],
      ['mot nua toa do', { latitudeE7: 210283000, longitudeE7: null }],
      ['ban kinh khong tam', { geofenceRadiusM: 100 }],
      ['ban kinh bang khong', { latitudeE7: 0, longitudeE7: 0, geofenceRadiusM: 0 }],
    ])('C1-INT-06 — DB tu choi: %s', async (_label, over) => {
      await expect(createStation(over)).rejects.toThrow();
    });

    it('C1-INT-07 — bi danh sai khuon bi DB tu choi', async () => {
      const station = await createStation({ name: 'Tram khuon', nameNormalized: 'TRAM KHUON' });
      await expect(
        stations.addAlias({
          stationId: station.id,
          normalized: 'chxd',
          raw: 'chxd',
          createdBy: 'it',
          at,
        }),
      ).rejects.toThrow();
    });

    /**
     * `RESTRICT` sang nha cung cap, `CASCADE` xuong bi danh — hai chieu CO Y nguoc nhau.
     *
     * Mot tram bien mat theo mot lan xoa nha cung cap se lam moi phieu do dau cu tro vao hu khong.
     * Mot bi danh o lai sau khi tram bi xoa thi chiem cho khoa unique toan cuc mai mai.
     */
    it('C1-INT-08 — nha cung cap con tram thi khong xoa duoc; tram bi xoa thi bi danh di theo', async () => {
      const station = await createStation({
        name: 'Tram rang buoc',
        nameNormalized: 'TRAM RANG BUOC',
      });
      const alias = await stations.addAlias({
        stationId: station.id,
        normalized: 'TRAM RB',
        raw: 'Tram RB',
        createdBy: 'it',
        at,
      });

      await expect(
        prisma.transportFuelSupplier.delete({ where: { id: state.supplierId } }),
      ).rejects.toThrow();

      await prisma.transportFuelStation.delete({ where: { id: station.id } });
      expect(await stations.findAliasByNormalized(alias.normalized)).toBeNull();
    });

    /**
     * PHAN "KHONG PHA T4" — mot hang cay xang tao bang duong CU van doc/ghi binh thuong.
     *
     * `ingestChannels` phai la MANG RONG chu khong `undefined`: mot giao dien goi `.map()` tren no
     * se nem, va do la kieu hong chi lo ra tren stack cua khach sau khi migration da chay.
     */
    it('C1-INT-09 — hang cay xang cu doc ra sieu du lieu RONG, khong `undefined`', async () => {
      const legacy = await prisma.transportFuelSupplier.findUnique({
        where: { id: state.legacySupplierId },
      });
      expect(legacy?.paymentTermDays).toBeNull();
      expect(legacy?.contractStartDate).toBeNull();
      expect(legacy?.ingestChannels).toEqual([]);

      const updated = await prisma.transportFuelSupplier.update({
        where: { id: state.legacySupplierId },
        data: { paymentTermDays: 30, ingestChannels: ['EINVOICE'] },
      });
      expect(updated.ingestChannels).toEqual(['EINVOICE']);
    });

    it('C1-INT-10 — `CHECK` cua bang cay xang chan ky han va ky hop dong vo ly', async () => {
      const id = state.legacySupplierId;
      await expect(
        prisma.transportFuelSupplier.update({ where: { id }, data: { paymentTermDays: 400 } }),
      ).rejects.toThrow();
      await expect(
        prisma.transportFuelSupplier.update({
          where: { id },
          data: { contractStartDate: '2026-12-31', contractEndDate: '2026-01-01' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.transportFuelSupplier.update({
          where: { id },
          data: { contractStartDate: '31/12/2026' },
        }),
      ).rejects.toThrow();
    });

    /**
     * Cau `OR` hai cot cua duong nhan dang — chay tren SQL THAT.
     *
     * Ban trong bo nho loc bang `Array.filter`, nen no khong the chung minh gi ve mot cau Prisma
     * `where: { OR: [...] }`. Bai nay doc bo ung vien qua dung duong ma runtime dung.
     */
    it('C1-INT-11 — bo ung vien gom ca tram khop ten, khop ma va tram cua bi danh', async () => {
      const byName = await createStation({
        name: 'Tram tim theo ten',
        nameNormalized: 'TRAM TIM THEO TEN',
      });
      const byCode = await createStation({
        name: 'Tram tim theo ma',
        nameNormalized: 'TRAM TIM THEO MA',
        code: 'CH-42',
        codeNormalized: 'CH42',
      });
      const byAlias = await createStation({
        name: 'Tram bi danh xa',
        nameNormalized: 'TRAM BI DANH XA',
      });
      await stations.addAlias({
        stationId: byAlias.id,
        normalized: 'TRAM TIM THEO TEN',
        raw: 'tram tim theo ten',
        createdBy: 'it',
        at,
      });

      const candidates = await stations.findResolutionCandidates({
        codeNormalized: 'CH42',
        labelNormalized: 'TRAM TIM THEO TEN',
      });

      const ids = candidates.stations.map((row) => row.id).sort();
      expect(ids).toEqual([byName.id, byCode.id, byAlias.id].sort());
      expect(candidates.aliases).toEqual([
        { normalized: 'TRAM TIM THEO TEN', stationId: byAlias.id },
      ]);
    });

    it('C1-INT-12 — khong khoa nao thi khong cham DB va tra ve bo rong', async () => {
      const candidates = await stations.findResolutionCandidates({
        codeNormalized: null,
        labelNormalized: '',
      });
      expect(candidates).toEqual({ stations: [], aliases: [] });
    });
  },
);
