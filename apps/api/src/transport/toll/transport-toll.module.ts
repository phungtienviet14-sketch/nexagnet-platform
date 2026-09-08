import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { TransportModule } from '../transport.module.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { InMemoryTollRepository } from './in-memory-toll.repository.js';
import { PrismaTollRepository } from './prisma-toll.repository.js';
import { TollApiRegistry } from './toll-api.port.js';
import { TollAccountService } from './toll-account.service.js';
import { TRANSPORT_TOLL_POLICY, tenantTransportTollPolicy } from './toll-policy.js';
import { FileTollStatementSource, TollStatementSource } from './toll-statement-source.js';
import { TransportTollCoreFacts, TransportTollCoreFactsAdapter } from './toll.ports.js';
import { TollRepository } from './toll.repository.js';
import { TollService } from './toll.service.js';

/**
 * Capability `transport-toll` — `TX-08` mo rong (Lane J, Issue #269).
 *
 * ===========================================================================
 * PHU THUOC DUNG MOT capability: `transport-core`.
 *
 * Doc mot sao ke ETC can doi xe de noi bien so ve mot chiec xe, va khong can gi khac.
 *
 * KHONG phu thuoc `transport-costing`, va do la mot PHAT BIEU chu khong mot su tinh gian: ETC la
 * CONG TY TRA (#229 §8, #237), no khong di qua so quy lai xe. Neu module nay import module costing,
 * thi mot ngay nao do mot nguoi se thay `CostingService` san o day va goi no — va bat bien "ETC
 * khong cham so quy lai xe" se mat, khong phai vi ai quyet the, ma vi no o trong tam voi.
 *
 * KHONG phu thuoc `transport-fuel` du hai ben giong nhau ve hinh dang nap tep. Giong hinh dang
 * khong phai mot phu thuoc: noi chung lai se bat mot khach chi muon doi soat ETC phai khai ca dinh
 * muc nhien lieu, va mot lan sua quy uoc bien so cua nhien lieu se lang le doi cach doc sao ke ETC.
 *
 * ===========================================================================
 * `TollApiRegistry` DUOC DANG KY VOI MOT DANH SACH ADAPTER RONG.
 *
 * Do khong phai mot thieu sot — do la ket qua da do: khong nha cung cap nao cong bo tai lieu API
 * (do 08/09/2026). Cong van o day de mot lenh nap qua duong `API` THAT BAI DONG voi
 * `TOLL_API_NOT_PUBLICLY_PROVEN` kem duong doi hoi hop phap (ND 119/2024 D.26 kh.2), thay vi tra
 * ve rong trong im lang.
 */
@Module({
  imports: [PrismaModule, TransportModule],
  providers: [
    {
      provide: TollRepository,
      useFactory: (prisma: PrismaService): TollRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaTollRepository(prisma)
          : new InMemoryTollRepository(),
      inject: [PrismaService],
    },
    { provide: TollStatementSource, useClass: FileTollStatementSource },
    {
      provide: TransportTollCoreFacts,
      useFactory: (fleet: FleetRepository): TransportTollCoreFacts =>
        new TransportTollCoreFactsAdapter(fleet),
      inject: [FleetRepository],
    },
    TollApiRegistry,
    {
      /*
       * Mui gio den TU `transport-core`, khong duoc khai lai.
       *
       * Hai mui gio cho mot khach la mot cach lang le lam mot luot qua tram 23:40 roi vao thang
       * nay tren mot bao cao va thang khac tren mot bao cao kia (`INV-25`).
       */
      provide: TRANSPORT_TOLL_POLICY,
      useFactory: (core: TransportCorePolicy) => tenantTransportTollPolicy(core.timeZone),
      inject: [TRANSPORT_CORE_POLICY],
    },
    TollService,
    TollAccountService,
  ],
  exports: [TollService, TollAccountService],
})
export class TransportTollModule {}
