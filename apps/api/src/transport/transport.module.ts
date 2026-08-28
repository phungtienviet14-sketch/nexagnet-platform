import { Module } from '@nestjs/common';
import { AuditLogRepository, InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../audit/prisma-audit-log.repository.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
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
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    FleetService,
    TripService,
    TransportActionGuard,
  ],
  exports: [FleetService, TripService, TransportActionGuard, FleetRepository, TripRepository],
})
export class TransportModule {}
