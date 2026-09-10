import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportAcceptanceModule } from '../acceptance/transport-acceptance.module.js';
import { TransportSettlementModule } from '../settlement/transport-settlement.module.js';
import { CustomerArReadService } from './customer-ar-read.service.js';
import { CustomerArRepository } from './customer-ar.repository.js';
import { CustomerArService } from './customer-ar.service.js';
import { InMemoryCustomerArRepository } from './in-memory-customer-ar.repository.js';
import { PrismaCustomerArRepository } from './prisma-customer-ar.repository.js';

@Module({
  imports: [PrismaModule, TransportAcceptanceModule, TransportSettlementModule],
  providers: [
    {
      provide: CustomerArRepository,
      useFactory: (prisma: PrismaService): CustomerArRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaCustomerArRepository(prisma)
          : new InMemoryCustomerArRepository(),
      inject: [PrismaService],
    },
    CustomerArService,
    CustomerArReadService,
  ],
  exports: [CustomerArService, CustomerArReadService, CustomerArRepository],
})
export class CustomerArModule {}
