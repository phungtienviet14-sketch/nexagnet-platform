import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportCostingModule } from '../costing/transport-costing.module.js';
import { TransportFuelModule } from '../fuel/transport-fuel.module.js';
import { TransportModule } from '../transport.module.js';
import { InMemorySettlementRepository } from './in-memory-settlement.repository.js';
import { PrismaSettlementRepository } from './prisma-settlement.repository.js';
import { SettlementReadService } from './settlement-read.service.js';
import {
  FuelSettlementSource,
  FuelSettlementSourceAdapter,
  SettlementCoreFacts,
  SettlementCoreFactsAdapter,
  SettlementCostingFacts,
  SettlementCostingFactsAdapter,
} from './settlement.ports.js';
import { SettlementRepository } from './settlement.repository.js';
import { SettlementService } from './settlement.service.js';

/**
 * Capability `transport-settlement` — `TX-05 AR/AP, quyet toan doi tac, hoa hong, bien truc tiep`.
 *
 * ===========================================================================
 * PHU THUOC CA BA capability van tai truoc no, va quan he do doc duoc o dong `imports`.
 *
 * Issue #87 viet mot dong ngan: *"`transport-settlement` depends on `transport-core`"*. Ban lam ro
 * cua kien truc su tren chinh Issue do da chot day du chuoi:
 *
 *     transport-settlement -> transport-core -> transport-costing -> transport-fuel
 *
 * Hai phu thuoc them KHONG phai de cho dep, chung la QUAN HE THAT:
 *
 *   · `transport-fuel` — dong THU NHAT trong nam dong ma Issue #87 bat buoc giu rieng la
 *     "cong ty va cay xang", va no chi ton tai neu co ban giao cua `TX-04` de doc. Bo phu thuoc
 *     nay thi mot khach bat `transport-settlement` se co BON dong thay vi nam, va dong thieu la
 *     dong co so tien lon nhat (nhien lieu chiem 35-45% gia thanh chuyen theo nguon khach).
 *
 *   · `transport-costing` — bien truc tiep cua mot chuyen XE NHA la
 *     `doanh thu - chi phi truc tiep - hoa hong`, va so hang thu hai den tu `TX-03`. Khong co no
 *     thi `direct-margin.ts` chi tinh duoc chuyen thue ngoai, tuc mot nua bao cao bien.
 *
 * `transport-fuel` da keo `transport-costing` va `transport-core` theo, nhung ca ba van duoc khai
 * TUONG MINH o `tenant.schema.ts` — danh sach do la mot HOP DONG doc duoc, khong phai mot phep
 * tinh toi gian. Ngay ai do doi phu thuoc cua fuel, phu thuoc that cua settlement van con nguyen.
 *
 * ===========================================================================
 * BA CONG RA NGOAI deu duoc buoc o day, va deu CHI DOC:
 *
 *   `SettlementCoreFacts`    -> doc chuyen (co `freightAmount` — xem `settlement.ports.ts`)
 *   `SettlementCostingFacts` -> doc chi phi truc tiep QUA `CostingReadService`, khong qua kho
 *   `FuelSettlementSource`   -> doc ban giao cua `TX-04` QUA `FuelRepository`
 *
 * Khong cong nao co ham ghi. `NO_CROSS_CONTEXT_REPOSITORY_WRITE` duoc giu bang KIEU.
 */
@Module({
  imports: [PrismaModule, TransportModule, TransportCostingModule, TransportFuelModule],
  providers: [
    {
      provide: SettlementRepository,
      useFactory: (prisma: PrismaService): SettlementRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaSettlementRepository(prisma)
          : new InMemorySettlementRepository(),
      inject: [PrismaService],
    },
    { provide: SettlementCoreFacts, useClass: SettlementCoreFactsAdapter },
    { provide: SettlementCostingFacts, useClass: SettlementCostingFactsAdapter },
    { provide: FuelSettlementSource, useClass: FuelSettlementSourceAdapter },
    SettlementService,
    SettlementReadService,
  ],
  exports: [SettlementService, SettlementReadService, SettlementRepository],
})
export class TransportSettlementModule {}
