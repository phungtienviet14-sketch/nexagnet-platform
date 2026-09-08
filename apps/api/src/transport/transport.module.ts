import { Module } from '@nestjs/common';
import { AuditLogRepository, InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../audit/prisma-audit-log.repository.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { AssetOwnershipScopeService } from './asset-ownership/asset-ownership-scope.service.js';
import {
  AssetOwnershipRepository,
  InMemoryAssetOwnershipRepository,
} from './asset-ownership/asset-ownership.repository.js';
import { AssetOwnershipService } from './asset-ownership/asset-ownership.service.js';
import { FleetVehicleOwnershipAdapter } from './asset-ownership/fleet-vehicle-ownership.adapter.js';
import { PrismaAssetOwnershipRepository } from './asset-ownership/prisma-asset-ownership.repository.js';
import { VehicleOwnershipPort } from './asset-ownership/vehicle-ownership.port.js';
import { CounterpartySubjectPort } from './counterparty/counterparty-subject.port.js';
import {
  CounterpartyRepository,
  InMemoryCounterpartyRepository,
} from './counterparty/counterparty.repository.js';
import { CounterpartyService } from './counterparty/counterparty.service.js';
import {
  CounterpartySiteRepository,
  InMemoryCounterpartySiteRepository,
} from './counterparty/site.repository.js';
import { CounterpartySiteService } from './counterparty/site.service.js';
import { PrismaCounterpartySiteRepository } from './counterparty/prisma-counterparty-site.repository.js';
import { MovementRepository, InMemoryMovementRepository } from './movement/movement.repository.js';
import { MovementService } from './movement/movement.service.js';
import { PrismaMovementRepository } from './movement/prisma-movement.repository.js';
import {
  TRANSPORT_PLANNING_POLICY,
  tenantTransportPlanningPolicy,
} from './planning/planning-policy.js';
import { InMemoryRunPlanRepository, RunPlanRepository } from './planning/planning.repository.js';
import { PlanningService } from './planning/planning.service.js';
import { PrismaRunPlanRepository } from './planning/prisma-planning.repository.js';
import { FleetCounterpartySubjectAdapter } from './counterparty/fleet-counterparty-subject.adapter.js';
import { PrismaCounterpartyRepository } from './counterparty/prisma-counterparty.repository.js';
import { FleetRepository, InMemoryFleetRepository } from './fleet/fleet.repository.js';
import { FleetService } from './fleet/fleet.service.js';
import { PrismaFleetRepository } from './fleet/prisma-fleet.repository.js';
import { TransportActionGuard } from './transport-action.guard.js';
import { TRANSPORT_CORE_POLICY, tenantTransportCorePolicy } from './transport-policy.js';
import { PrismaTripRepository } from './trips/prisma-trip.repository.js';
import { InMemoryTripRepository, TripRepository } from './trips/trip.repository.js';
import { TripService } from './trips/trip.service.js';

/**
 * Capability `transport-core` — `TX-01 Fleet` + `TX-02 Trip Operations`.
 *
 * TU CUNG CAP `AuditLogService` cua chinh no, giong `NotificationModule` da lam.
 *
 * `OperationalSettingsModule` (owner `operations`, `@Global`) hom nay VAN duoc nap cho moi khach —
 * do duoc bang `app.module.transport-core.boot.spec.ts` — vi `AuthModule` cua `foundation` import
 * no. Nhung do la mot TAI NAN cua quyen so huu composition, khong phai mot hop dong: ngay ai do
 * sua khe ho do (va no dang la mot khoang cach da duoc ghi ten), mot khach van tai khong bat
 * `operations` se mat sach `AuditLogService` — tuc ghi duoc du lieu ma khong ghi duoc mot dong dau
 * vet nao, va khong co gi do o dau ca.
 *
 * T1 §10.1 cho `transport-core` phu thuoc RONG, nen module nay phai dung duoc mot minh.
 *
 * `TransportActionGuard` dang ky o day (khong phai `APP_GUARD`) va duoc export de ba controller
 * cam vao qua `@UseGuards`: mot cong cua mot vertical khong duoc chay tren moi request cua moi
 * khach.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: AuditLogRepository,
      useFactory: (prisma: PrismaService): AuditLogRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaAuditLogRepository(prisma)
          : new InMemoryAuditLogRepository(),
      inject: [PrismaService],
    },
    AuditLogService,
    {
      provide: FleetRepository,
      useFactory: (prisma: PrismaService): FleetRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaFleetRepository(prisma)
          : new InMemoryFleetRepository(),
      inject: [PrismaService],
    },
    {
      provide: TripRepository,
      useFactory: (prisma: PrismaService): TripRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaTripRepository(prisma)
          : new InMemoryTripRepository(),
      inject: [PrismaService],
    },
    {
      provide: CounterpartyRepository,
      useFactory: (prisma: PrismaService): CounterpartyRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaCounterpartyRepository(prisma)
          : new InMemoryCounterpartyRepository(),
      inject: [PrismaService],
    },
    /*
     * DIA DIEM VAN HANH (`#267` H1). Den cung `transport-core` vi no la mot MAT cua ho so phap
     * nhan, khong phai mot thuc the cua tang bam vi tri: mot khach chua bat `transport-proof` van
     * khai duoc danh sach kho cua khach hang minh.
     */
    {
      provide: CounterpartySiteRepository,
      useFactory: (prisma: PrismaService): CounterpartySiteRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaCounterpartySiteRepository(prisma)
          : new InMemoryCounterpartySiteRepository(),
      inject: [PrismaService],
    },
    /*
     * CONG kiem chu the — hien thuc duy nhat hom nay dung dung nhung danh muc cua chinh
     * `transport-core`. Mot loai chu the thuoc capability khac se dang ky adapter cua rieng no o
     * capability do, khong them mot canh phu thuoc nao vao day.
     */
    {
      provide: CounterpartySubjectPort,
      useFactory: (fleet: FleetRepository): CounterpartySubjectPort =>
        new FleetCounterpartySubjectAdapter(fleet),
      inject: [FleetRepository],
    },
    {
      provide: MovementRepository,
      useFactory: (prisma: PrismaService): MovementRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaMovementRepository(prisma)
          : new InMemoryMovementRepository(),
      inject: [PrismaService],
    },
    {
      provide: AssetOwnershipRepository,
      useFactory: (prisma: PrismaService): AssetOwnershipRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaAssetOwnershipRepository(prisma)
          : new InMemoryAssetOwnershipRepository(),
      inject: [PrismaService],
    },
    /*
     * CONG HEP sang doi xe (`TX-08`). Dich vu so huu KHONG duoc tiem `FleetRepository` — no chi
     * thay nam phuong thuc cua cong nay, nen khong co duong nao de no ghi vao bang lai xe, bang
     * khach hang hay bang doi tac. Xem `vehicle-ownership.port.ts`.
     */
    {
      provide: VehicleOwnershipPort,
      useFactory: (fleet: FleetRepository): VehicleOwnershipPort =>
        new FleetVehicleOwnershipAdapter(fleet),
      inject: [FleetRepository],
    },
    /*
     * LICH SU LAP KE HOACH (Lane L, #276). Den cung `transport-core` vi no ghi qua chinh
     * `MovementService` va khong doc mot capability nao khac: mot khach chi bat `transport-core`
     * van phai co duong "gan don vao xe" ma khong phai tu tao vong chay.
     */
    {
      provide: RunPlanRepository,
      useFactory: (prisma: PrismaService): RunPlanRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaRunPlanRepository(prisma)
          : new InMemoryRunPlanRepository(),
      inject: [PrismaService],
    },
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    /*
     * KHONG khai `policy: 'transportPlanning'` trong `capabilityRequirements`, cung ly le voi
     * `transportCore`: ca ba khoi cua no (che do gom nhom, bai xe, nguong nghi) deu co mac dinh
     * dung duoc, nen khai se bien mot khoi hoan toan tuy chon thanh mot dieu kien boot cho MOI
     * khach van tai dang chay.
     */
    { provide: TRANSPORT_PLANNING_POLICY, useFactory: tenantTransportPlanningPolicy },
    FleetService,
    TripService,
    CounterpartyService,
    CounterpartySiteService,
    MovementService,
    PlanningService,
    AssetOwnershipService,
    AssetOwnershipScopeService,
    TransportActionGuard,
  ],
  /*
   * `AuditLogService` va `TRANSPORT_CORE_POLICY` duoc export tu T3 tro di cho `transport-costing`.
   *
   * Chia se thay vi cho costing tu dung lay: mot lan chi tien va lan doi trang thai chuyen di cung
   * no phai nam trong CUNG MOT dong dau vet, va mui gio tenant phai la MOT gia tri — hai ban doc
   * doc lap se lech nhau dung vao ngay ai do doi cau hinh, va lech do roi vao ngay nghiep vu.
   */
  exports: [
    FleetService,
    TripService,
    CounterpartyService,
    CounterpartySiteService,
    MovementService,
    PlanningService,
    AssetOwnershipService,
    AssetOwnershipScopeService,
    TransportActionGuard,
    FleetRepository,
    /*
     * `transport-acceptance` (`#268` Lane I) tiem thang `CounterpartyRepository` qua
     * `AcceptanceCounterpartyFactsAdapter`. Thieu dong nay thi Nest khong giai duoc phu thuoc va
     * TIEN TRINH API CHET LUC KHOI DONG — khong phai mot loi luc chay, ma la khong boot duoc.
     *
     * No da lot qua moi cong mot lan: `tsc` xanh (kieu dung het), test don vi xanh (dung lop truc
     * tiep, khong qua injector), `*.composition.spec.ts` xanh (chi hoi provider co TRONG DANH SACH
     * khong). Cai bat duoc no la `app.module.transport-preview.boot.spec.ts` — va bai do duoc them
     * cung luc voi dong nay.
     */
    CounterpartyRepository,
    CounterpartySiteRepository,
    TripRepository,
    MovementRepository,
    RunPlanRepository,
    AuditLogService,
    TRANSPORT_CORE_POLICY,
    TRANSPORT_PLANNING_POLICY,
  ],
})
export class TransportModule {}
