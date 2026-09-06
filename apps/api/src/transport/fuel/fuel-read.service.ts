import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  toDriverFuelSlipView,
  toDriverFuelSupplierView,
  type DriverFuelSlipView,
  type DriverFuelSupplierView,
} from './driver-fuel.view.js';
import { TRANSPORT_FUEL_DECISIONS } from './fuel-decisions.js';
import { TransportFuelCoreFacts } from './fuel.ports.js';
import { FuelRepository } from './fuel.repository.js';
import type { FuelEntryInboxFilter } from './fuel.repository.js';
import type {
  FuelEntry,
  FuelEntryDetail,
  FuelEntryInboxPage,
  FuelReceiptEvidence,
  FuelReconciliation,
  FuelReconciliationWorkspace,
  FuelSupplier,
} from './fuel.types.js';

/**
 * YEU CAU cua hop thu o TANG UNG DUNG — giong `FuelEntryInboxFilter` tru mot cho.
 *
 * Nguoi dung loc bang MA CHUYEN (`tripCode`), tang kho loc bang `tripIds`. Phep doi giua hai thu do
 * la mot lan doc `transport-core`, va no thuoc tang nay chu khong thuoc tang kho (§4.1 luat 4).
 */
export interface FuelEntryInboxRequest extends Omit<FuelEntryInboxFilter, 'tripIds'> {
  readonly tripCode: string | null;
  readonly limit: number;
  readonly offset: number;
}

/**
 * KHUNG NHIN cua `TX-04` — duong DOC, tach khoi duong GHI.
 *
 * KHONG mot loi goi ghi nao trong ca tep, ke ca nhung loi goi rat de lot vao cho tien. Cung ly le
 * da viet o `costing-read.service.ts`: mot lan `GET` sinh ra mot hang la mot tac dung phu khong ai
 * doc ten ham ma doan duoc.
 *
 * ---------------------------------------------------------------------------
 * BE MAT LAI XE O DAY DUOC CHOT BANG QUYEN SO HUU, KHONG BANG VAI.
 *
 * `SALE` la cho giu tam cho vai lai xe (`GD-22`), nen HAI lai xe khac nhau mang CUNG mot vai. Cat
 * hanh dong theo vai vi vay khong du — cong that la: danh tinh den tu PHIEN, doi ra `driverId`, roi
 * moi ban ghi tra ve deu phai thuoc chinh `driverId` do. `DRIVER-VIEW-002` la hat giong cua dieu
 * nay, va o T4 no ap cho ca phieu do dau.
 */
@Injectable()
export class FuelReadService {
  constructor(
    private readonly repository: FuelRepository,
    private readonly core: TransportFuelCoreFacts,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* ------------------------- Be mat van hanh ------------------------- */

  async listSuppliers(): Promise<FuelSupplier[]> {
    return this.repository.listSuppliers();
  }

  /**
   * CAY XANG cho BE MAT LAI XE — danh sach y het, KHUNG NHIN hep hon.
   *
   * Khong dung lai `listSuppliers()` o tang controller roi cat bot truong: cat o cho goi la thu
   * de quen o lan them route sau. Cat o DAY, mot lan, va kieu tra ve la thu cuong che dieu do.
   */
  async listSuppliersForDriver(): Promise<DriverFuelSupplierView[]> {
    return (await this.repository.listSuppliers()).map(toDriverFuelSupplierView);
  }

  async fuelEntryDetail(entryId: string): Promise<FuelEntryDetail> {
    const entry = await this.requireEntry(entryId);
    return { entry, evidence: await this.repository.listEvidence(entry.id) };
  }

  /**
   * HOP THU PHIEU NHIEN LIEU cua CA DOI — #222 P1-B.
   *
   * ===========================================================================
   * VI SAO CONG NAY PHAI TON TAI
   *
   * Truoc no, duong doc phieu duy nhat o be mat van hanh la THEO TUNG CHUYEN. Ke toan muon biet
   * "phieu nao dang cho toi" phai mo lan luot tung chuyen — tuc cong viec ma man Nhien lieu quang
   * cao (`Phiếu đổ dầu, xác thực phiếu…`) khong lam duoc o quy mo doi xe. Do la lo hong #222 P1-B
   * do duoc tren ban DANG CHAY: mot phieu 62,500 L that cua lai xe khong xuat hien o dau trong
   * menu Nhien lieu.
   *
   * ===========================================================================
   * MA CHUYEN DUOC DOI SANG ID O DAY, va tra ve `[]` khi khong khop
   *
   * `tripIds: []` khac han `tripIds: null` (xem `FuelEntryInboxFilter`): loc theo mot ma chuyen
   * khong ton tai phai cho ra hop thu RONG, khong phai TOAN BO hop thu.
   *
   * ===========================================================================
   * PHEP DOI ID -> CHU LAM MOT LAN, THEO LO
   *
   * Bon bang tra duoc doc SONG SONG va MOI CAI MOT LAN, roi ap cho ca trang. Khong mot vong lap
   * nao o day goi vao DB — do la ranh gioi giua "mot truy van may chu" va dung kieu N+1 ma #222
   * cam.
   */
  async fuelEntryInbox(query: FuelEntryInboxRequest): Promise<FuelEntryInboxPage> {
    const tripIds = await this.resolveTripFilter(query.tripCode);

    const page = await this.repository.listEntriesForInbox({
      verification: query.verification,
      reconciliation: query.reconciliation,
      tripIds,
      driverId: query.driverId,
      vehicleId: query.vehicleId,
      supplierId: query.supplierId,
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
    });

    const [trips, drivers, vehicles, suppliers, evidence] = await Promise.all([
      this.core.listTripsByIds(page.entries.map((entry) => entry.tripId)),
      this.core.listDrivers(),
      this.core.listVehicles(),
      this.repository.listSuppliers(),
      // MOT lan doc cho ca trang. Goi `listEvidence` tung dong se la N lan cham DB cho mot man
      // hinh — dung kieu N+1 ma #222 cam, chi la doi cho tu trinh duyet xuong may chu.
      this.repository.listEvidenceForEntries(page.entries.map((entry) => entry.id)),
    ]);

    const tripCode = new Map(trips.map((trip) => [trip.id, trip.code]));
    const driverName = new Map(drivers.map((driver) => [driver.id, driver.fullName]));
    const vehiclePlate = new Map(
      vehicles.map((vehicle) => [vehicle.id, vehicle.registrationPlate]),
    );
    const supplierName = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    const evidenceByEntry = evidence;

    return {
      rows: page.entries.map((entry) => {
        const files = evidenceByEntry.get(entry.id) ?? [];
        return {
          id: entry.id,
          tripId: entry.tripId,
          // Ma chuyen doc duoc khong ra thi HIEN `id` — mot o trong o cot dinh danh se lam nguoi
          // doi soat mat duong tim nguoc ve chuyen.
          tripCode: tripCode.get(entry.tripId) ?? entry.tripId,
          driverId: entry.driverId,
          driverName: driverName.get(entry.driverId) ?? null,
          vehicleId: entry.vehicleId,
          vehiclePlate: vehiclePlate.get(entry.vehicleId) ?? null,
          supplierId: entry.supplierId,
          supplierName: supplierName.get(entry.supplierId) ?? null,
          businessDate: entry.businessDate,
          occurredAt: entry.occurredAt,
          litersUnits: entry.litersUnits,
          amount: entry.amount,
          currencyCode: entry.currencyCode,
          invoiceNo: entry.invoiceNo,
          paymentMethod: entry.paymentMethod,
          verificationStatus: entry.verificationStatus,
          reconciliationStatus: entry.reconciliationStatus,
          reviewReasons: entry.reviewReasons,
          reviewNote: entry.reviewNote,
          evidenceCount: files.length,
          // Chon TUNG TRUONG, khong spread: `FuelReceiptEvidence` mang `locator`, va mot `...row`
          // o day se lang le day dinh vi kho anh ra trinh duyet.
          evidence: files.map((file) => ({ id: file.id, contentType: file.contentType })),
        };
      }),
      total: page.total,
      pendingVerificationCount: page.pendingVerificationCount,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * `null` = khong loc theo chuyen. `[]` = co loc va khong chuyen nao khop.
   *
   * Hai gia tri nay KHONG duoc gop: gop lai thi mot lan tim ma chuyen go sai se tra ve ca hop thu,
   * va nguoi dung se doc mot danh sach khong lien quan gi den thu ho vua hoi.
   */
  private async resolveTripFilter(tripCode: string | null): Promise<readonly string[] | null> {
    if (tripCode === null) return null;
    const trip = await this.core.findTripByCode(tripCode);
    return trip === null ? [] : [trip.id];
  }

  /** Phieu cua MOT CHUYEN — man hinh gia thanh chuyen cua Giam doc/Ke toan. */
  async listTripFuelEntries(tripId: string): Promise<FuelEntry[]> {
    if (!(await this.core.findTrip(tripId))) {
      throw TransportDomainError.notFound('TRIP_NOT_FOUND', `Khong tim thay chuyen ${tripId}`);
    }
    return this.repository.listEntriesByTrip(tripId);
  }

  async listReconciliations(): Promise<FuelReconciliation[]> {
    return this.repository.listReconciliations();
  }

  /**
   * BAN LAM VIEC DOI SOAT — moi thu tren MOT man hinh, ghep o day chu khong o giao dien.
   *
   * Neu giao dien tu goi bon endpoint roi tu ghep, thu tu ghep se quyet dinh con so tong, va hai
   * man hinh ghep hai kieu se cho hai con so khac nhau cho cung mot ky. Con so `pendingDiscrepancy`
   * o day la chinh con so chan viec dong ky (`FUEL-RECON-004`), nen no phai den tu cung mot nguon
   * voi cai cong do doc.
   */
  async reconciliationWorkspace(reconciliationId: string): Promise<FuelReconciliationWorkspace> {
    const reconciliation = await this.repository.findReconciliation(reconciliationId);
    if (!reconciliation) {
      throw TransportDomainError.notFound(
        'FUEL_RECONCILIATION_NOT_FOUND',
        `Khong tim thay ky doi soat ${reconciliationId}`,
      );
    }

    const statement = await this.repository.findStatement(reconciliation.statementId);
    if (!statement) {
      throw TransportDomainError.notFound(
        'FUEL_STATEMENT_NOT_FOUND',
        `Khong tim thay bang ke ${reconciliation.statementId}`,
      );
    }

    const [lines, matches, discrepancies, handoff] = await Promise.all([
      this.repository.listStatementLines(statement.id),
      this.repository.listMatches(reconciliationId),
      this.repository.listDiscrepancies(reconciliationId),
      this.repository.findHandoff(reconciliationId),
    ]);

    return {
      reconciliation,
      statement,
      lines,
      matches,
      discrepancies,
      pendingDiscrepancyCount: discrepancies.filter((item) => item.status === 'PENDING').length,
      handoff,
    };
  }

  /* -------------------------- Be mat lai xe -------------------------- */

  /** PHIEU CUA CHINH TOI. Danh tinh den tu phien, khong bao gio tu `:driverId` tren duong dan. */
  async listMyFuelSlips(authUserId: string): Promise<DriverFuelSlipView[]> {
    const driver = await this.requireDriverBinding(authUserId);
    const entries = await this.repository.listEntriesByDriver(driver.id);

    const views = await Promise.all(
      entries.map(async (entry) =>
        toDriverFuelSlipView(entry, await this.repository.listEvidence(entry.id)),
      ),
    );
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'driver.self_fuel_scope',
      outcome: 'allowed',
      reason: 'SELF_FUEL_SCOPE_GRANTED',
      detail: { driverId: driver.id, slipCount: views.length },
    });
    return views;
  }

  /**
   * MOT phieu cua chinh toi.
   *
   * Phieu cua nguoi khac tra ve `SELF_FUEL_SCOPE_NOT_OWNED` (403), KHONG phai mot ban rut gon —
   * `DRIVER-VIEW-002`. Tra ve mot ban rut gon se xac nhan rang phieu do TON TAI, va do da la mot
   * thong tin ma nguoi hoi khong duoc phep co.
   */
  async getMyFuelSlip(authUserId: string, entryId: string): Promise<DriverFuelSlipView> {
    const driver = await this.requireDriverBinding(authUserId);
    const entry = await this.requireEntry(entryId);

    if (entry.driverId !== driver.id) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'driver.self_fuel_scope',
        outcome: 'denied',
        reason: 'SELF_FUEL_SCOPE_NOT_OWNED',
        detail: { driverId: driver.id, fuelEntryId: entryId },
      });
      throw TransportDomainError.denied(
        'SELF_FUEL_SCOPE_NOT_OWNED',
        'Phieu nay khong thuoc lai xe dang dang nhap',
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'driver.self_fuel_scope',
      outcome: 'allowed',
      reason: 'SELF_FUEL_SCOPE_GRANTED',
      detail: { driverId: driver.id, fuelEntryId: entryId },
    });
    return toDriverFuelSlipView(entry, await this.repository.listEvidence(entry.id));
  }

  /**
   * PHIEN -> HO SO LAI XE. Duong DUY NHAT be mat lai xe biet minh dang phuc vu ai.
   *
   * Cong khai ra ngoai vi `DriverFuelController` can dung chinh phep doi nay TRUOC khi goi duong
   * ghi: mot lai xe nop phieu cho chinh minh khong duoc phep go `driverId` cua nguoi khac vao than
   * yeu cau. Mot phep doi, mot cho.
   */
  async requireDriverBinding(authUserId: string): Promise<{ id: string; fullName: string }> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'driver.self_fuel_scope',
        outcome: 'denied',
        reason: 'SELF_FUEL_SCOPE_NO_DRIVER_BINDING',
        detail: { authUserId },
      });
      throw TransportDomainError.denied(
        'SELF_FUEL_SCOPE_NO_DRIVER_BINDING',
        'Tai khoan nay chua duoc noi voi ho so lai xe nao',
      );
    }
    return driver;
  }

  /**
   * MOT HANG BANG CHUNG cua phieu CUA CHINH TOI — `#169`.
   *
   * Di qua `getMyFuelSlip()` chu khong tu kiem lai `entry.driverId`: cong "phieu cua chinh toi" da
   * co MOT cau tra loi trong he thong, va viet cau thu hai o day se tao ra hai luat de lech nhau.
   *
   * Tra ve ca `locator`, nhung KHONG qua `DriverFuelSlipView` — khung nhin cua lai xe co y chi mang
   * `evidenceCount`. Dinh vi la chi tiet cua tang luu tru, va no chi duoc di toi `MediaStore`, khong
   * di toi trinh duyet.
   */
  async myFuelSlipEvidence(
    authUserId: string,
    entryId: string,
    evidenceId: string,
  ): Promise<FuelReceiptEvidence> {
    await this.getMyFuelSlip(authUserId, entryId);
    return this.requireEvidenceOnEntry(entryId, evidenceId);
  }

  /** Nhu tren, cho be mat VAN HANH: quyen do `transport.fuel.entry.read` chot o controller. */
  async fuelEntryEvidence(entryId: string, evidenceId: string): Promise<FuelReceiptEvidence> {
    await this.requireEntry(entryId);
    return this.requireEvidenceOnEntry(entryId, evidenceId);
  }

  /**
   * Hang bang chung phai THUOC VE phieu tren duong dan.
   *
   * Doc theo `fuelEntryId` roi loc trong danh sach do, chu khong tra thang `evidenceId`: mot ham
   * `findEvidence(id)` se tra ve hang cua phieu BAT KY, va luc do quyen so huu vua kiem o tren
   * khong con y nghia gi — nguoi goi chi viec doi `evidenceId` tren URL.
   */
  private async requireEvidenceOnEntry(
    entryId: string,
    evidenceId: string,
  ): Promise<FuelReceiptEvidence> {
    const evidence = await this.repository.listEvidence(entryId);
    const found = evidence.find((row) => row.id === evidenceId);
    if (!found) {
      throw TransportDomainError.notFound(
        'EVIDENCE_NOT_ON_RECORD',
        `Phieu ${entryId} khong co bang chung ${evidenceId}`,
      );
    }
    return found;
  }

  private async requireEntry(entryId: string): Promise<FuelEntry> {
    const entry = await this.repository.findEntry(entryId);
    if (!entry) {
      throw TransportDomainError.notFound(
        'FUEL_ENTRY_NOT_FOUND',
        `Khong tim thay phieu ${entryId}`,
      );
    }
    return entry;
  }
}
