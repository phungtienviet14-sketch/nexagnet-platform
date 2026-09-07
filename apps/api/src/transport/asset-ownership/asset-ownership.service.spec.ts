import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryAssetOwnershipRepository } from './asset-ownership.repository.js';
import { AssetOwnershipService } from './asset-ownership.service.js';
import { FleetVehicleOwnershipAdapter } from './fleet-vehicle-ownership.adapter.js';

/**
 * SO DANG KY SO HUU — `TX-08`, #242 E1/E2/E4.
 *
 * Bo test nay do bon dieu ma #242 goi ten, va moi dieu deu la mot cach he thong CO THE sai:
 *
 *   E1 — them mot dong so huu KHONG duoc bien xe thanh xe nha ngoai;
 *   E2 — sua mot ty le KHONG duoc lam bien mat ty le cu;
 *   E2 — du lieu so huu KHONG DAY DU van phai ghi duoc;
 *   E4 — khong mot nghia vu tien nao duoc sinh ra tu mot ty le.
 */

const ACTOR = 'nguoi-van-hanh';
const JAN = new Date('2026-01-01T00:00:00.000Z');
const JUN = new Date('2026-06-01T00:00:00.000Z');

describe('AssetOwnershipService — so dang ky so huu tai san', () => {
  let fleet: InMemoryFleetRepository;
  let repository: InMemoryAssetOwnershipRepository;
  let service: AssetOwnershipService;
  let vehicleId: string;

  beforeEach(async () => {
    fleet = new InMemoryFleetRepository();
    repository = new InMemoryAssetOwnershipRepository();
    service = new AssetOwnershipService(
      repository,
      new FleetVehicleOwnershipAdapter(fleet),
      new AuditLogService(new InMemoryAuditLogRepository()),
    );
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29H-000.01',
      vehicleClass: 'DAU_KEO',
    });
    vehicleId = vehicle.id;
  });

  const newStakeholder = async (displayName: string, kind: 'PERSON' | 'ORGANIZATION' = 'PERSON') =>
    service.createStakeholder({ kind, displayName }, ACTOR);

  /* ------------------------------------------------------------------ *
   * E1 — hai truc doc lap
   * ------------------------------------------------------------------ */

  it('xe moi la xe B dieu hanh va so dang ky chua duoc khai day du', async () => {
    const register = await service.register(vehicleId);
    expect(register.operationalControl).toBe('INTERNAL_OPERATED');
    expect(register.registerComplete).toBe(false);
    expect(register.current).toEqual([]);
    expect(register.unattributedBasisPoints).toBe(10_000);
  });

  /**
   * BAI QUAN TRONG NHAT CUA E1.
   *
   * Phan xa sai la coi "co ben huu quan ngoai" dong nghia voi "xe cua nha xe ngoai". Mot xe dong so
   * huu ma B van phan cong lai xe, van chiu chi phi, van thu cuoc — thi no la xe NOI BO. Neu bai
   * nay do, nghia la co ai do da noi hai truc lai voi nhau.
   */
  it('them mot ben huu quan KHONG bien xe thanh xe nha ngoai', async () => {
    const gopVon = await newStakeholder('Ba con gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: gopVon.id, ownershipBasisPoints: 4_000, effectiveFrom: JAN },
      ACTOR,
    );

    const register = await service.register(vehicleId);
    expect(register.operationalControl).toBe('INTERNAL_OPERATED');
    expect(register.current).toHaveLength(1);
  });

  it('doi quyen dieu hanh KHONG dong mot quyen loi so huu nao', async () => {
    const gopVon = await newStakeholder('Ba con gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: gopVon.id, ownershipBasisPoints: 4_000, effectiveFrom: JAN },
      ACTOR,
    );

    const after = await service.setOperationalControl(vehicleId, 'EXTERNAL_CARRIER', ACTOR);
    expect(after.operationalControl).toBe('EXTERNAL_CARRIER');
    expect(after.current).toHaveLength(1);
    expect(after.current[0]?.ownershipBasisPoints).toBe(4_000);
  });

  /* ------------------------------------------------------------------ *
   * E2 — diem co ban, lich su, va du lieu khong day du
   * ------------------------------------------------------------------ */

  it.each([0, -1, 10_001, 33.33, Number.NaN])(
    'tu choi ty le %s — phai la so nguyen diem co ban 1..10000',
    async (bps) => {
      const holder = await newStakeholder('Nguoi gop von');
      await expect(
        service.recordInterest(
          vehicleId,
          { stakeholderId: holder.id, ownershipBasisPoints: bps, effectiveFrom: JAN },
          ACTOR,
        ),
      ).rejects.toMatchObject({ reason: 'OWNERSHIP_BASIS_POINTS_INVALID' });
    },
  );

  /**
   * SO HUU KHONG DAY DU LA MOT TRANG THAI HOP LE.
   *
   * #242 E2: *"do not reject legitimate partial known data merely because interests do not sum to
   * 100%"*. Mot doanh nghiep dang nhap dan chi biet mot phan, va buoc tong ve 100% se buoc nguoi
   * nhap BIA NOT phan con lai.
   */
  it('nhan mot ty le le loi khi so dang ky chua duoc khai day du', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: holder.id, ownershipBasisPoints: 2_500, effectiveFrom: JAN },
      ACTOR,
    );

    const register = await service.register(vehicleId);
    expect(register.currentBasisPointsTotal).toBe(2_500);
    expect(register.unattributedBasisPoints).toBe(7_500);
    expect(register.registerComplete).toBe(false);
  });

  it('nhieu ben huu quan tren mot xe, va mot ben huu quan tren nhieu xe', async () => {
    const b = await newStakeholder('Cong ty B', 'ORGANIZATION');
    const nguoiGop = await newStakeholder('Nguoi gop von');
    const xeHai = await fleet.createVehicle({
      registrationPlate: '29H-000.02',
      vehicleClass: 'DAU_KEO',
    });

    await service.recordInterest(
      vehicleId,
      { stakeholderId: b.id, ownershipBasisPoints: 6_000, effectiveFrom: JAN },
      ACTOR,
    );
    await service.recordInterest(
      vehicleId,
      { stakeholderId: nguoiGop.id, ownershipBasisPoints: 4_000, effectiveFrom: JAN },
      ACTOR,
    );
    await service.recordInterest(
      xeHai.id,
      { stakeholderId: nguoiGop.id, ownershipBasisPoints: 10_000, effectiveFrom: JAN },
      ACTOR,
    );

    const register = await service.register(vehicleId);
    expect(register.current.map((row) => row.ownershipBasisPoints)).toEqual([6_000, 4_000]);
    expect(register.currentBasisPointsTotal).toBe(10_000);
    expect(await repository.listInterestsForStakeholder(nguoiGop.id)).toHaveLength(2);
  });

  it('mot ben huu quan khong the co hai ty le song song tren cung mot xe', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: holder.id, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );

    await expect(
      service.recordInterest(
        vehicleId,
        { stakeholderId: holder.id, ownershipBasisPoints: 5_000, effectiveFrom: JUN },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });

  /**
   * LICH SU KHONG BI GHI DE — bai trung tam cua E2.
   *
   * Sua mot ty le la DONG ban cu roi MO ban moi. Sau hai buoc do, cau hoi "thang 1 ho so huu bao
   * nhieu" phai VAN co cau tra loi, va no phai la con so cu.
   */
  it('sua mot ty le giu nguyen ban cu doc lai duoc', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    const first = await service.recordInterest(
      vehicleId,
      { stakeholderId: holder.id, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );

    await service.closeInterest(
      first.id,
      { effectiveTo: JUN, note: 'chuyen nhuong mot phan' },
      ACTOR,
    );
    await service.recordInterest(
      vehicleId,
      { stakeholderId: holder.id, ownershipBasisPoints: 5_000, effectiveFrom: JUN },
      ACTOR,
    );

    const register = await service.register(vehicleId);
    expect(register.current.map((row) => row.ownershipBasisPoints)).toEqual([5_000]);
    expect(register.history).toHaveLength(1);
    expect(register.history[0]).toMatchObject({
      ownershipBasisPoints: 3_000,
      effectiveFrom: JAN.toISOString(),
      effectiveTo: JUN.toISOString(),
      closedBy: ACTOR,
      closedNote: 'chuyen nhuong mot phan',
    });
  });

  it('dong hai lan la idempotent va khong ghi de moc dong dau tien', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    const interest = await service.recordInterest(
      vehicleId,
      { stakeholderId: holder.id, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );
    await service.closeInterest(interest.id, { effectiveTo: JUN }, ACTOR);

    const again = await service.closeInterest(
      interest.id,
      { effectiveTo: new Date('2026-09-01T00:00:00.000Z') },
      ACTOR,
    );
    expect(again.effectiveTo).toBe(JUN.toISOString());
  });

  it('tu choi moc dong khong sau moc bat dau', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    const interest = await service.recordInterest(
      vehicleId,
      { stakeholderId: holder.id, ownershipBasisPoints: 3_000, effectiveFrom: JUN },
      ACTOR,
    );
    await expect(
      service.closeInterest(interest.id, { effectiveTo: JAN }, ACTOR),
    ).rejects.toMatchObject({ reason: 'OWNERSHIP_PERIOD_INVALID' });
  });

  /* ------------------------------------------------------------------ *
   * E2 — bat bien tong CHI khi so dang ky duoc khai la day du
   * ------------------------------------------------------------------ */

  /**
   * TRAN 100% AP CA KHI SO DANG KY CON THIEU — hoi quy tu bang chung luc chay.
   *
   * Ban dau phep kiem tong nam trong `if (registerComplete)`, nen mot so dang ky "con thieu" nhan
   * duoc tong 11500 diem tren `transport-preview/gd1-test`. Hai khai niem bi lan: "day du" quyet
   * dinh tong co phai BANG 10000; no khong quyet dinh tong co bi CHAN o 10000. Khong ai so huu
   * duoc 115% mot chiec xe, du he thong da biet het chu hay chua.
   */
  it('tu choi lam tong vuot 100% NGAY CA KHI so dang ky chua khai day du', async () => {
    const b = await newStakeholder('Cong ty B', 'ORGANIZATION');
    const nguoiGop = await newStakeholder('Nguoi gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: b.id, ownershipBasisPoints: 7_000, effectiveFrom: JAN },
      ACTOR,
    );

    const register = await service.register(vehicleId);
    expect(register.registerComplete).toBe(false);

    await expect(
      service.recordInterest(
        vehicleId,
        { stakeholderId: nguoiGop.id, ownershipBasisPoints: 3_001, effectiveFrom: JAN },
        ACTOR,
      ),
    ).rejects.toMatchObject({ reason: 'OWNERSHIP_BASIS_POINTS_INVALID' });

    // ...va dung 3000 thi qua: tran la 10000, khong phai mot con so nho hon.
    await service.recordInterest(
      vehicleId,
      { stakeholderId: nguoiGop.id, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );
    expect((await service.register(vehicleId)).currentBasisPointsTotal).toBe(10_000);
  });

  /**
   * DONG ban cu roi MO ban moi voi ty le CAO HON van phai qua.
   *
   * Neu tran duoc tinh tren tong TRUOC khi dong, mot lan tang ty le hop le se bi chan — va nguoi
   * dung se khong con duong nao sua so lieu. Bai nay khoa rang duong sua van thong.
   */
  it('tang ty le cua mot ben huu quan qua duoc, vi ban cu da dong truoc', async () => {
    const b = await newStakeholder('Cong ty B', 'ORGANIZATION');
    const nguoiGop = await newStakeholder('Nguoi gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: b.id, ownershipBasisPoints: 5_000, effectiveFrom: JAN },
      ACTOR,
    );
    const cu = await service.recordInterest(
      vehicleId,
      { stakeholderId: nguoiGop.id, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );

    await service.closeInterest(cu.id, { effectiveTo: JUN }, ACTOR);
    await service.recordInterest(
      vehicleId,
      { stakeholderId: nguoiGop.id, ownershipBasisPoints: 5_000, effectiveFrom: JUN },
      ACTOR,
    );

    expect((await service.register(vehicleId)).currentBasisPointsTotal).toBe(10_000);
  });

  it('khong khai day du duoc khi tong chua dung 10000 diem', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: holder.id, ownershipBasisPoints: 9_999, effectiveFrom: JAN },
      ACTOR,
    );
    await expect(service.declareRegisterComplete(vehicleId, true, ACTOR)).rejects.toBeInstanceOf(
      TransportDomainError,
    );
  });

  it('so dang ky da khai day du tu choi mot ty le lam vuot 100%', async () => {
    const b = await newStakeholder('Cong ty B', 'ORGANIZATION');
    const nguoiGop = await newStakeholder('Nguoi gop von');
    const nguoiThuBa = await newStakeholder('Nguoi thu ba');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: b.id, ownershipBasisPoints: 7_000, effectiveFrom: JAN },
      ACTOR,
    );
    await service.recordInterest(
      vehicleId,
      { stakeholderId: nguoiGop.id, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );
    const complete = await service.declareRegisterComplete(vehicleId, true, ACTOR);
    expect(complete.registerComplete).toBe(true);
    expect(complete.unattributedBasisPoints).toBe(0);

    await expect(
      service.recordInterest(
        vehicleId,
        { stakeholderId: nguoiThuBa.id, ownershipBasisPoints: 1, effectiveFrom: JUN },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });

  /**
   * DONG mot quyen loi tren mot so dang ky da khai day du KHONG bi chan.
   *
   * Nguoi ta ban co phan cua ho la mot su that da xay ra ngoai doi. Cai he thong lam la HA loi khai
   * xuong — noi ra rang so dang ky khong con day du — chu khong phai tu choi ghi nhan su that do.
   */
  it('dong mot quyen loi lam so dang ky tu ha khoi trang thai day du', async () => {
    const b = await newStakeholder('Cong ty B', 'ORGANIZATION');
    const nguoiGop = await newStakeholder('Nguoi gop von');
    await service.recordInterest(
      vehicleId,
      { stakeholderId: b.id, ownershipBasisPoints: 7_000, effectiveFrom: JAN },
      ACTOR,
    );
    const phanGop = await service.recordInterest(
      vehicleId,
      { stakeholderId: nguoiGop.id, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );
    await service.declareRegisterComplete(vehicleId, true, ACTOR);

    await service.closeInterest(phanGop.id, { effectiveTo: JUN }, ACTOR);

    const register = await service.register(vehicleId);
    expect(register.registerComplete).toBe(false);
    expect(register.currentBasisPointsTotal).toBe(7_000);
    expect(register.unattributedBasisPoints).toBe(3_000);
    expect(register.history).toHaveLength(1);
  });

  /* ------------------------------------------------------------------ *
   * Ho so ben huu quan
   * ------------------------------------------------------------------ */

  it('khong mo them quyen loi cho mot ho so da ngung hoat dong', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    await service.updateStakeholder(holder.id, { status: 'INACTIVE' }, ACTOR);
    await expect(
      service.recordInterest(
        vehicleId,
        { stakeholderId: holder.id, ownershipBasisPoints: 1_000, effectiveFrom: JAN },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });

  it('khong noi mot tai khoan dang thuoc ho so khac', async () => {
    const mot = await newStakeholder('Nguoi thu nhat');
    const hai = await newStakeholder('Nguoi thu hai');
    await service.setStakeholderAccount(mot.id, 'user-1', ACTOR);
    await expect(service.setStakeholderAccount(hai.id, 'user-1', ACTOR)).rejects.toMatchObject({
      reason: 'ASSET_STAKEHOLDER_ACCOUNT_TAKEN',
    });
  });

  /**
   * `authUserId` KHONG duoc ro ri ra khung nhin doc.
   *
   * Mot bang danh sach ben huu quan mang dinh danh tai khoan la mot bang anh xa nguoi dung — thu ma
   * khong man hinh nao can va moi ke tan cong deu muon.
   */
  it('khung nhin ben huu quan noi CO tai khoan hay khong, nhung khong noi la tai khoan nao', async () => {
    const holder = await newStakeholder('Nguoi gop von');
    const linked = await service.setStakeholderAccount(holder.id, 'user-1', ACTOR);
    expect(linked.hasAccount).toBe(true);
    expect(JSON.stringify(linked)).not.toContain('user-1');

    const unlinked = await service.setStakeholderAccount(holder.id, null, ACTOR);
    expect(unlinked.hasAccount).toBe(false);
  });
});
