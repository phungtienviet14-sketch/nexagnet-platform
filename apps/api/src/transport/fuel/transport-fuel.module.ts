import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportCostingModule } from '../costing/transport-costing.module.js';
import { TransportModule } from '../transport.module.js';
import { FuelReadService } from './fuel-read.service.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import { TRANSPORT_FUEL_POLICY, tenantTransportFuelPolicy } from './fuel-policy.js';
import { FileFuelStatementSource, FuelStatementSource } from './fuel-statement-source.js';
import { FuelStatementService } from './fuel-statement.service.js';
import {
  CostingFuelExpenseAdapter,
  FuelCostingPort,
  TransportFuelCoreFacts,
  TransportFuelCoreFactsAdapter,
} from './fuel.ports.js';
import { FuelRepository } from './fuel.repository.js';
import { FuelService } from './fuel.service.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';

/**
 * Capability `transport-fuel` — `TX-04 Fuel + doi soat bang ke`.
 *
 * PHU THUOC CA HAI capability van tai truoc no (T1 §10.1), va quan he do doc duoc ngay o dong
 * `imports` duoi day. Mot khach bat fuel ma quen bat costing se bi `tenant.schema.ts` chan TU LUC
 * DOC GOI, truoc khi Nest kip dung do thi module — thay vi boot xong roi de lai mot he thong noi
 * lai xe nhap phieu dau moi ngay ma khong con so nao vao gia thanh chuyen.
 *
 * ---------------------------------------------------------------------------
 * KHONG tu cung cap `AuditLogService` cua rieng no, giong `TransportCostingModule`: phu thuoc do da
 * co san tu `TransportModule` va duoc khai bao. Dung MOT instance thi mot lan duyet phieu dau, lan
 * ghi khoan chi sinh ra tu no, va lan doi trang thai chuyen deu nam trong CUNG mot dong dau vet.
 *
 * ---------------------------------------------------------------------------
 * HAI CONG RA NGOAI deu duoc buoc o day, va do la cho DUY NHAT chung duoc buoc:
 *
 *   `TransportFuelCoreFacts` -> `TransportFuelCoreFactsAdapter` (CHI DOC — §4.1 luat 4)
 *   `FuelCostingPort`        -> `CostingFuelExpenseAdapter`     (qua `CostingService`, khong qua kho)
 *
 * Doi mot trong hai sang mot hien thuc ghi thang vao kho cua capability khac se lam moi cong cua
 * T2/T3 mat hieu luc tren duong tien cua T4 — xem khoi chu thich dau `fuel.ports.ts`.
 */
@Module({
  imports: [PrismaModule, TransportModule, TransportCostingModule],
  providers: [
    {
      provide: FuelRepository,
      useFactory: (prisma: PrismaService): FuelRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaFuelRepository(prisma)
          : new InMemoryFuelRepository(),
      inject: [PrismaService],
    },
    { provide: TransportFuelCoreFacts, useClass: TransportFuelCoreFactsAdapter },
    { provide: FuelCostingPort, useClass: CostingFuelExpenseAdapter },
    { provide: FuelStatementSource, useClass: FileFuelStatementSource },
    { provide: TRANSPORT_FUEL_POLICY, useFactory: tenantTransportFuelPolicy },
    FuelService,
    FuelStatementService,
    FuelReconciliationService,
    FuelReadService,
  ],
  exports: [
    FuelService,
    FuelStatementService,
    FuelReconciliationService,
    FuelReadService,
    FuelRepository,
  ],
})
export class TransportFuelModule {}
