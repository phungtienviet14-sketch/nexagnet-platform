import { Module } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { GroupParticipantsController } from './group-participants.controller.js';
import {
  GroupParticipantsRepository,
  InMemoryGroupParticipantsRepository,
} from './group-participants.repository.js';
import { GroupParticipantsService } from './group-participants.service.js';
import { PrismaGroupParticipantsRepository } from './prisma-group-participants.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [GroupParticipantsController],
  providers: [
    GroupParticipantsService,
    {
      provide: GroupParticipantsRepository,
      useFactory: (prisma: PrismaService): GroupParticipantsRepository =>
        loadEnv().PERSISTENCE === 'prisma'
          ? new PrismaGroupParticipantsRepository(prisma)
          : new InMemoryGroupParticipantsRepository(),
      inject: [PrismaService],
    },
  ],
  exports: [GroupParticipantsService, GroupParticipantsRepository],
})
export class GroupParticipantsModule {}
