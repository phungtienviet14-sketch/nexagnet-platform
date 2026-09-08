import type { BusinessDate } from '../business-date.js';
import type { FleetRepository } from '../fleet/fleet.repository.js';
import type { TollMatchState, TollReviewAction } from './toll.types.js';
import type { TollProvider, TollSourceKind, TollTransactionKind } from './toll-provider.port.js';

/**
 * CUA SO DUY NHAT tu `transport-toll` nhin sang `transport-core` — CHI DOC.
 *
 * T1 §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`). Cach re nhat de tuan thu la ky luat, va ky
 * luat khong song sot qua sau lan sua cua sau nguoi. Cach dat la CAU TRUC: toll khong duoc tiem
 * `FleetRepository`, no duoc tiem cong nay, va cong nay KHONG CO mot ham ghi nao.
 *
 * `TollVehicleFacts` CO Y NGHEO — hai truong. Mot lan nhap sao ke ETC khong can biet trong tai hay
 * so odo cua chiec xe, va mot cong tra ve ca `Vehicle` se lam ranh gioi do troi di sau vai lan sua.
 */
export interface TollVehicleFacts {
  readonly id: string;
  readonly registrationPlate: string;
}

export abstract class TransportTollCoreFacts {
  abstract listVehicles(): Promise<readonly TollVehicleFacts[]>;
  abstract findVehicle(vehicleId: string): Promise<TollVehicleFacts | null>;
}

/* ====================================================================== *
 * LENH GHI cua tang kho
 * ====================================================================== */

export interface CreateTollAccountInput {
  readonly provider: TollProvider;
  readonly accountNo: string;
  readonly holderName: string | null;
}

export interface OpenTollLinkInput {
  readonly accountId: string;
  readonly vehicleId: string;
  readonly providerVehicleRef: string | null;
  readonly effectiveFrom: BusinessDate;
  readonly effectiveTo: BusinessDate | null;
  readonly createdBy: string;
  readonly at: Date;
}

/** MOT dong da doc/tu choi, o dang san sang ghi. Tang kho khong tinh gi them. */
export interface TollCandidateWrite {
  readonly rowNumber: number;
  readonly parseStatus: 'ACCEPTED' | 'REJECTED';
  readonly rejectReason: string | null;
  readonly accountNoRaw: string;
  readonly accountId: string | null;
  readonly kind: TollTransactionKind | null;
  readonly vehiclePlateRaw: string;
  readonly vehicleId: string | null;
  readonly passedAt: Date | null;
  readonly businessDate: BusinessDate | null;
  readonly signedAmount: number | null;
  readonly stationLabel: string | null;
  readonly providerRef: string | null;
  readonly fingerprint: string | null;
  readonly matchState: TollMatchState | null;
  readonly rawValues: Readonly<Record<string, string>>;
}

export interface CreateTollImportInput {
  readonly provider: TollProvider;
  readonly sourceKind: TollSourceKind;
  readonly sourceLabel: string;
  readonly sourceDigest: string;
  readonly periodStart: BusinessDate | null;
  readonly periodEnd: BusinessDate | null;
  readonly rowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly importedBy: string;
  readonly at: Date;
  readonly candidates: readonly TollCandidateWrite[];
}

/**
 * MOT LAN QUYET cua nguoi doi soat — mot lenh, va no ghi HAI thu trong CUNG mot giao dich:
 * trang thai moi cua dong, va mot dong lich su khong sua duoc.
 *
 * Tach lam hai lan goi se de lai mot dong da doi trang thai ma KHONG co ai ky ten — dung cai ma
 * #269 J7 doi phai tranh.
 */
export interface ApplyTollReviewInput {
  readonly candidateId: string;
  readonly action: TollReviewAction;
  readonly actor: string;
  readonly at: Date;
  readonly reason: string;
  readonly note: string | null;
  readonly nextVehicleId: string | null;
  readonly nextMatchState: TollMatchState | null;
  readonly nextReviewState: 'PENDING' | 'CONFIRMED' | 'REOPENED';
  readonly duplicateOfCandidateId: string | null;
}

export interface TollCandidateFilter {
  readonly provider?: TollProvider;
  readonly importId?: string;
  readonly accountId?: string;
  readonly matchState?: TollMatchState;
  readonly reviewState?: 'PENDING' | 'CONFIRMED' | 'REOPENED';
  readonly limit: number;
  readonly offset: number;
}

/**
 * HIEN THUC DUY NHAT cua cua so nhin sang `transport-core` — CHI DOC.
 *
 * Tiem `FleetRepository` chu khong `FleetService`: o day chi can hai truong cua mot chiec xe, va
 * mot service mang theo ca duong GHI cua no. Lop nay la cho DUY NHAT `transport-toll` cham vao
 * `transport-core`, nen mot lan ai do muon ghi sang do se phai sua dung mot tep — va se thay ngay
 * rang khong ham nao o day ghi duoc gi.
 */
export class TransportTollCoreFactsAdapter extends TransportTollCoreFacts {
  constructor(private readonly fleet: FleetRepository) {
    super();
  }

  async listVehicles(): Promise<readonly TollVehicleFacts[]> {
    const vehicles = await this.fleet.listVehicles();
    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      registrationPlate: vehicle.registrationPlate,
    }));
  }

  async findVehicle(vehicleId: string): Promise<TollVehicleFacts | null> {
    const vehicle = await this.fleet.findVehicle(vehicleId);
    if (!vehicle) return null;
    return { id: vehicle.id, registrationPlate: vehicle.registrationPlate };
  }
}
