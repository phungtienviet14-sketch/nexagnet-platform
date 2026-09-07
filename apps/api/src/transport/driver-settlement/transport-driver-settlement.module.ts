import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportCostingModule } from '../costing/transport-costing.module.js';
import { TransportModule } from '../transport.module.js';
import { TransportWorkforceModule } from '../workforce/transport-workforce.module.js';
import { DriverSettlementReadService } from './driver-settlement-read.service.js';
import {
  DriverSettlementCoreFacts,
  DriverSettlementCoreFactsAdapter,
  DriverSettlementFundPort,
  DriverSettlementFundPortAdapter,
  DriverSettlementPayrollFacts,
  DriverSettlementPayrollFactsAdapter,
} from './driver-settlement.ports.js';
import { DriverSettlementRepository } from './driver-settlement.repository.js';
import { DriverSettlementService } from './driver-settlement.service.js';
import { InMemoryDriverSettlementRepository } from './in-memory-driver-settlement.repository.js';
import { PrismaDriverSettlementRepository } from './prisma-driver-settlement.repository.js';

/**
 * `TX-07b` — lan chi tien cho lai xe + phan bo (Lane D, Issue #237).
 *
 * ===========================================================================
 * KHONG CO CAPABILITY MOI, va do la mot lua chon co ly le chu khong phai tiet kiem cong.
 *
 * `CAPABILITY_IDS` la mot enum DONG trong `packages/tenant` (R0 `F-12`), nen mot capability moi
 * keo theo: sua goi khach cua moi khach van tai dang chay, sua do thi phu thuoc, sua bo test boot,
 * va cham vao `packages/tenant` — vung ma #223/#224 dang lam viec. R1-A′ (#230) da di truoc theo
 * dung duong nay va ghi lai ly do o `transport-domain-v2.md` §10.1.
 *
 * Va `transport-workforce` la chu so huu DUNG: no da khai bao chinh xac hai phu thuoc ma tang nay
 * can (`transport-core` cho ho so lai xe, `transport-costing` cho so quy), va phieu luong — nguon
 * cua moi khoan da ghi nhan — song trong chinh capability do. Mot khach bat luong ma khong bat
 * quyet toan se co bang luong khong bao gio tra duoc thanh tien.
 *
 * ===========================================================================
 * `DriverSettlementFundPort` la cong DUY NHAT co lenh ghi sang mot capability khac, va lenh do
 * KHONG duoc viet o day: no la `CostingService.postReimbursement`, thuoc chinh chu so cai.
 */
@Module({
  imports: [PrismaModule, TransportModule, TransportCostingModule, TransportWorkforceModule],
  providers: [
    {
      provide: DriverSettlementRepository,
      useFactory: (prisma: PrismaService): DriverSettlementRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaDriverSettlementRepository(prisma)
          : new InMemoryDriverSettlementRepository(),
      inject: [PrismaService],
    },
    { provide: DriverSettlementCoreFacts, useClass: DriverSettlementCoreFactsAdapter },
    { provide: DriverSettlementPayrollFacts, useClass: DriverSettlementPayrollFactsAdapter },
    { provide: DriverSettlementFundPort, useClass: DriverSettlementFundPortAdapter },
    DriverSettlementService,
    DriverSettlementReadService,
  ],
  exports: [DriverSettlementService, DriverSettlementReadService, DriverSettlementRepository],
})
export class TransportDriverSettlementModule {}
