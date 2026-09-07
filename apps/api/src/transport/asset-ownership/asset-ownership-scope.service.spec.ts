import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { AssetOwnershipScopeService } from './asset-ownership-scope.service.js';
import { InMemoryAssetOwnershipRepository } from './asset-ownership.repository.js';
import { AssetOwnershipService } from './asset-ownership.service.js';
import { FleetVehicleOwnershipAdapter } from './fleet-vehicle-ownership.adapter.js';

/**
 * NGHIEM THU DOI KHANG cua be mat ben huu quan — #242 E6.
 *
 * Bo test nay khong do "tinh nang chay dung". No do rang mot nguoi CO TAI KHOAN HOP LE khong lay
 * duoc du lieu ma ho khong duoc phep lay. Moi bai duoi day tuong ung mot dong cua E6, va moi bai
 * mo ta mot lan tan cong CO THAT: doi tham so tren duong dan, dung mot cau noi da het han, hoac
 * dung mot tai khoan da bi thu hoi.
 *
 * BOI CANH: xe SO MOT thuoc ve `chiA`; xe SO HAI thuoc ve `chiB`. Hai nguoi khong biet gi ve nhau.
 */

const ACTOR = 'nguoi-van-hanh';
const JAN = new Date('2026-01-01T00:00:00.000Z');
const JUN = new Date('2026-06-01T00:00:00.000Z');

describe('AssetOwnershipScopeService — cach ly giua cac ben huu quan', () => {
  let fleet: InMemoryFleetRepository;
  let repository: InMemoryAssetOwnershipRepository;
  let ownership: AssetOwnershipService;
  let scope: AssetOwnershipScopeService;

  let xeMot: string;
  let xeHai: string;
  let chiA: string;
  let chiB: string;

  beforeEach(async () => {
    fleet = new InMemoryFleetRepository();
    repository = new InMemoryAssetOwnershipRepository();
    const vehicles = new FleetVehicleOwnershipAdapter(fleet);
    ownership = new AssetOwnershipService(
      repository,
      vehicles,
      new AuditLogService(new InMemoryAuditLogRepository()),
    );
    scope = new AssetOwnershipScopeService(repository, vehicles);

    xeMot = (
      await fleet.createVehicle({ registrationPlate: '29H-000.01', vehicleClass: 'DAU_KEO' })
    ).id;
    xeHai = (
      await fleet.createVehicle({ registrationPlate: '29H-000.02', vehicleClass: 'DAU_KEO' })
    ).id;

    const a = await ownership.createStakeholder({ kind: 'PERSON', displayName: 'Chi A' }, ACTOR);
    const b = await ownership.createStakeholder({ kind: 'PERSON', displayName: 'Chi B' }, ACTOR);
    chiA = a.id;
    chiB = b.id;

    await ownership.setStakeholderAccount(chiA, 'user-a', ACTOR);
    await ownership.setStakeholderAccount(chiB, 'user-b', ACTOR);

    await ownership.recordInterest(
      xeMot,
      { stakeholderId: chiA, ownershipBasisPoints: 3_000, effectiveFrom: JAN },
      ACTOR,
    );
    await ownership.recordInterest(
      xeHai,
      { stakeholderId: chiB, ownershipBasisPoints: 5_000, effectiveFrom: JAN },
      ACTOR,
    );
  });

  /* ------------------------------------------------------------------ *
   * Pham vi duong tinh
   * ------------------------------------------------------------------ */

  it('ben huu quan chi thay xe cua chinh minh', async () => {
    const cuaA = await scope.myVehicles('user-a');
    expect(cuaA).toHaveLength(1);
    expect(cuaA[0]?.registrationPlate).toBe('29H-000.01');
    expect(cuaA[0]?.myBasisPoints).toBe(3_000);

    const cuaB = await scope.myVehicles('user-b');
    expect(cuaB.map((row) => row.registrationPlate)).toEqual(['29H-000.02']);
  });

  /* ------------------------------------------------------------------ *
   * E6 — khong doc duoc xe cua nguoi khac
   * ------------------------------------------------------------------ */

  it('chi A KHONG doc duoc chiec xe chi doc quyen cua chi B', async () => {
    await expect(scope.myVehicle('user-a', xeHai)).rejects.toBeInstanceOf(TransportDomainError);
  });

  /**
   * DOI THAM SO TREN DUONG DAN khong mo duoc gi.
   *
   * Ba dinh danh: mot chiec xe cua nguoi khac, mot chiec xe khong ton tai, va mot chuoi rac. Ca ba
   * phai tra ve CUNG mot ket qua — neu chung khac nhau, duong nay thanh mot cong dem: ke goi doi
   * `vehicleId` cho toi khi ma tra loi doi, va dem duoc ca doi xe cua doanh nghiep.
   */
  it.each([
    ['xe cua nguoi khac', () => xeHai],
    ['xe khong ton tai', () => 'khong-co-that'],
    ['chuoi rac', () => '../../etc/passwd'],
  ])('doi vehicleId sang %s van bi tu choi y het nhau', async (_name, pick) => {
    const error = await scope.myVehicle('user-a', pick()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TransportDomainError);
    expect((error as TransportDomainError).kind).toBe('DENIED');
    expect((error as TransportDomainError).reason).toBe('ASSET_STAKEHOLDER_NOT_FOUND');
  });

  it('tai khoan chua noi voi ho so ben huu quan nao khong doc duoc gi', async () => {
    await expect(scope.myVehicles('user-la-mat')).rejects.toBeInstanceOf(TransportDomainError);
    await expect(scope.myVehicle('user-la-mat', xeMot)).rejects.toBeInstanceOf(
      TransportDomainError,
    );
  });

  it('ho so da ngung hoat dong mat sach pham vi doc', async () => {
    await ownership.updateStakeholder(chiA, { status: 'INACTIVE' }, ACTOR);
    await expect(scope.myVehicles('user-a')).rejects.toBeInstanceOf(TransportDomainError);
    await expect(scope.myVehicle('user-a', xeMot)).rejects.toBeInstanceOf(TransportDomainError);
  });

  it('go cau noi tai khoan la thu hoi quyen doc ngay lap tuc', async () => {
    await ownership.setStakeholderAccount(chiA, null, ACTOR);
    await expect(scope.myVehicles('user-a')).rejects.toBeInstanceOf(TransportDomainError);
  });

  /**
   * QUYEN LOI DA HET HAN KHONG PHAI QUYEN DOC HIEN TAI — dong minh thi cua E6.
   *
   * Sau khi dong, hang van nam trong bang (lich su duoc giu). Neu su ton tai cua hang do du de cap
   * quyen, thi moi nguoi tung so huu mot chiec xe se doc duoc no vinh vien.
   */
  it('quyen loi da dong khong con cap quyen doc', async () => {
    const interests = await repository.listInterestsForStakeholder(chiA);
    await ownership.closeInterest(interests[0]!.id, { effectiveTo: JUN }, ACTOR);

    /*
     * DANH SACH RONG, khong phai `403`.
     *
     * Nguoi nay VAN la mot ben huu quan co ho so va co tai khoan — ho chi khong con so huu chiec xe
     * nao. Tra `403` o day se noi sai ("tai khoan cua ban khong hop le") cho mot nguoi ma he thong
     * van cong nhan, va man hinh se hien mot trang loi thay vi cau tra loi dung: "ban hien khong co
     * co phan trong xe nao".
     *
     * Danh sach rong khong ro ri gi: no khong noi doanh nghiep co bao nhieu xe, cung khong noi ho
     * TUNG so huu chiec nao.
     */
    expect(await scope.myVehicles('user-a')).toEqual([]);

    // Con day moi la cong an toan: chi dich danh chiec xe cu VAN bi tu choi.
    await expect(scope.myVehicle('user-a', xeMot)).rejects.toBeInstanceOf(TransportDomainError);

    // ...trong khi hang lich su VAN con, va van doc duoc tu be mat van hanh.
    expect(await repository.listInterestsForStakeholder(chiA)).toHaveLength(1);
    expect((await ownership.register(xeMot)).history).toHaveLength(1);
  });

  /**
   * NGUOI DONG SO HUU tren cung mot chiec xe thay chinh xe do — nhung chi ty le CUA MINH.
   *
   * Day la khac biet tinh te nhat cua ca be mat: hai nguoi cung so huu mot chiec xe khong duong
   * nhien duoc biet nguoi kia so huu bao nhieu. Ty le cua nguoi khac la thong tin cua ho.
   */
  it('dong so huu thay xe chung nhung khong thay ty le cua nguoi kia', async () => {
    await ownership.recordInterest(
      xeMot,
      { stakeholderId: chiB, ownershipBasisPoints: 7_000, effectiveFrom: JAN },
      ACTOR,
    );

    const cuaA = await scope.myVehicle('user-a', xeMot);
    expect(cuaA.myBasisPoints).toBe(3_000);
    expect(JSON.stringify(cuaA)).not.toContain('7000');
    expect(JSON.stringify(cuaA)).not.toContain('Chi B');
  });

  /* ------------------------------------------------------------------ *
   * E3 — pham vi duong tinh, va tu choi mac dinh voi moi thu ngoai no
   * ------------------------------------------------------------------ */

  /**
   * KHUNG NHIN KHONG MANG DU LIEU CAM.
   *
   * Do bang cach serialise ca khung nhin roi tim ten truong — cung phep do ma Lane B dung cho
   * `containsLatitudeLiteral`. Mot truong nhay cam duoc them vao `StakeholderVehicleView` mot ngay
   * nao do se lam bai nay do, chu khong lang le chay ra man hinh cua khach.
   */
  it('khung nhin ben huu quan khong mang gia cuoc, cong no, luong hay toa do', async () => {
    const [view] = await scope.myVehicles('user-a');
    const serialised = JSON.stringify(view).toLowerCase();
    for (const forbidden of [
      'freight',
      'revenue',
      'margin',
      'receivable',
      'payroll',
      'payslip',
      'salary',
      'latitude',
      'longitude',
      'phone',
      'authuserid',
      'amount',
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('khung nhin mang dung nhung truong ma E3 cho phep', async () => {
    const [view] = await scope.myVehicles('user-a');
    expect(Object.keys(view ?? {}).sort()).toEqual([
      'currentOdoKm',
      'driverName',
      'myBasisPoints',
      'myEffectiveFrom',
      'myHistory',
      'operationalControl',
      'registrationPlate',
      'status',
      'vehicleClass',
      'vehicleId',
    ]);
  });

  it('lich su so huu cua chinh minh doc lai duoc sau khi ty le doi', async () => {
    const interests = await repository.listInterestsForStakeholder(chiA);
    await ownership.closeInterest(interests[0]!.id, { effectiveTo: JUN }, ACTOR);
    await ownership.recordInterest(
      xeMot,
      { stakeholderId: chiA, ownershipBasisPoints: 4_500, effectiveFrom: JUN },
      ACTOR,
    );

    const view = await scope.myVehicle('user-a', xeMot);
    expect(view.myBasisPoints).toBe(4_500);
    expect(view.myHistory).toEqual([
      { ownershipBasisPoints: 4_500, effectiveFrom: JUN.toISOString(), effectiveTo: null },
      {
        ownershipBasisPoints: 3_000,
        effectiveFrom: JAN.toISOString(),
        effectiveTo: JUN.toISOString(),
      },
    ]);
  });
});
