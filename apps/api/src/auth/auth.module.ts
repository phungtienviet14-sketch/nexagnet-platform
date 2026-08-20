import { Global, Module } from '@nestjs/common';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { OperationalSettingsModule } from '../settings/operational-settings.module.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Argon2PasswordService, PasswordService } from './password.service.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { InMemoryUserRepository, UserRepository } from './user.repository.js';
import { UsersController } from './users.controller.js';

@Global()
@Module({
  imports: [PrismaModule, OperationalSettingsModule],
  controllers: [AuthController, UsersController],
  providers: [
    {
      provide: UserRepository,
      useFactory: (prisma: PrismaService): UserRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaUserRepository(prisma)
          : new InMemoryUserRepository(),
      inject: [PrismaService],
    },
    { provide: PasswordService, useClass: Argon2PasswordService },
    AuthService,
  ],
  exports: [AuthService, UserRepository, PasswordService],
})
export class AuthModule {}
