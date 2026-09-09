import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportProofModule } from '../proof/transport-proof.module.js';
import { TRANSPORT_CORE_POLICY, tenantTransportCorePolicy } from '../transport-policy.js';
import { TransportModule } from '../transport.module.js';
import {
  TransportCheckpointCoreFacts,
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
  TransportCheckpointLocationFactsAdapter,
} from './checkpoint-facts.port.js';
import { DEFAULT_CHECKPOINT_POLICY, type CheckpointPolicy } from './checkpoint-lifecycle.js';
import { CheckpointRepository, InMemoryCheckpointRepository } from './checkpoint.repository.js';
import { CheckpointService, TRANSPORT_CHECKPOINT_POLICY } from './checkpoint.service.js';
import { PrismaCheckpointRepository } from './prisma-checkpoint.repository.js';
import { PrismaWaitingAllowanceRepository } from '../waiting/prisma-allowance.repository.js';
import { PrismaWaitingSessionRepository } from '../waiting/prisma-waiting.repository.js';
import {
  InMemoryWaitingAllowanceRepository,
  WaitingAllowanceRepository,
} from '../waiting/allowance.repository.js';
import {
  WaitingAllowanceDriverIdentityFacts,
  WaitingAllowanceDriverIdentityFactsAdapter,
} from '../waiting/allowance-facts.port.js';
import { WaitingAllowanceService } from '../waiting/allowance.service.js';
import { DeliveryWaitingCloser } from '../waiting/waiting-close.port.js';
import {
  InMemoryWaitingSessionRepository,
  WaitingSessionRepository,
} from '../waiting/waiting.repository.js';
import { WaitingSessionService } from '../waiting/waiting.service.js';

/**
 * Capability `transport-checkpoint` — moc van hanh, tai lieu hien truong, va thoi gian cho
 * (`#243`, tiep tuc o `#279`).
 *
 * PHIEN CHO NGUOI NHAN (`#279` O5) den cung capability nay chu khong mot capability moi, va do la
 * cau tra loi cua chinh `tenant.schema.ts`: khoi mo ta `transport-checkpoint` da viet
 * *"moc gan vao VehicleRun/RunLeg, phieu cong/can/giao, phien cho nguoi nhan, phu cap cho cua lai
 * xe"*. Mot khach co cong de vao va can de can thi cung la khach co khoang cho nguoi nhan; tach
 * chung ra se bat ho khai hai co cho mot quy trinh.
 *
 * MOT CAPABILITY RIENG, cung ly le da viet o `transport-proof`: mot khach van tai phai chay duoc
 * MA KHONG co quy trinh cong/can/phieu giao. Cong ty B co quy trinh do; khach chi chay chuyen le
 * thi khong. Nhet chin loai moc vao `transport-core` se bat moi khach van tai mang theo mot quy
 * trinh cua rieng mot khach — dung dieu ma Quyet dinh kien truc #6 cam.
 *
 * HAI PHU THUOC, va ca hai deu that:
 *   · `transport-core`  — moc gan vao `VehicleRun`/`RunLeg` da duoc Lane A chot;
 *   · `transport-proof` — nut `Da den noi` phai co chung cu vi tri, va chung cu do la ban dinh vi
 *     cua Lane B. Mot dong thoi gian ma khong chung minh duoc lan den noi thi khong tra loi duoc
 *     cau hoi ma `#243` F3 dat ra.
 *
 * Ca hai deu MOT CHIEU: `transport-core` va `transport-proof` khong biet gi ve capability nay.
 */
@Module({
  imports: [PrismaModule, TransportModule, TransportProofModule],
  providers: [
    {
      provide: CheckpointRepository,
      useFactory: (prisma: PrismaService): CheckpointRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaCheckpointRepository(prisma)
          : new InMemoryCheckpointRepository(),
      inject: [PrismaService],
    },
    { provide: TransportCheckpointCoreFacts, useClass: TransportCheckpointCoreFactsAdapter },
    {
      provide: TransportCheckpointLocationFacts,
      useClass: TransportCheckpointLocationFactsAdapter,
    },
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    {
      /**
       * Mac dinh la ho so B (`#232 D-08`): den noi giao va nhan hang bat buoc co vi tri.
       *
       * Khai o day chu khong o `tenant.schema.ts`, cung ly le voi `TRANSPORT_PROOF_POLICY`: mac
       * dinh nay dung duoc ngay, nen bat khach khai no se bien mot khoi hoan toan tuy chon thanh
       * mot dieu kien boot.
       */
      provide: TRANSPORT_CHECKPOINT_POLICY,
      useFactory: (): CheckpointPolicy => DEFAULT_CHECKPOINT_POLICY,
    },
    {
      provide: WaitingSessionRepository,
      useFactory: (prisma: PrismaService): WaitingSessionRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaWaitingSessionRepository(prisma)
          : new InMemoryWaitingSessionRepository(),
      inject: [PrismaService],
    },
    WaitingSessionService,
    {
      provide: WaitingAllowanceRepository,
      useFactory: (prisma: PrismaService): WaitingAllowanceRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaWaitingAllowanceRepository(prisma)
          : new InMemoryWaitingAllowanceRepository(),
      inject: [PrismaService],
    },
    {
      provide: WaitingAllowanceDriverIdentityFacts,
      useClass: WaitingAllowanceDriverIdentityFactsAdapter,
    },
    WaitingAllowanceService,
    /**
     * CAU NOI moc -> phien cho. MOT the hien, hai token.
     *
     * `useExisting` chu khong `useClass`: hai the hien `WaitingSessionService` se co hai kho khac
     * nhau o duong trong-bo-nho, va luc do moc `DELIVERY_ACCEPTED` se dong mot phien cho nam trong
     * mot kho ma khong ai doc.
     */
    { provide: DeliveryWaitingCloser, useExisting: WaitingSessionService },
    CheckpointService,
  ],
  exports: [
    CheckpointService,
    CheckpointRepository,
    /**
     * Cong DOC danh tinh lai xe + phan cong, xuat ra cho `TransportDocumentModule` (`#279` O1).
     *
     * Xuat CONG chu khong xuat `FleetRepository`/`MovementRepository`: mien chung tu can dung hai
     * cau hoi ("phien nay la ai" va "nguoi nay co tung cam vong chay do khong"), va cong nay khong
     * co mot ham ghi nao. Xuat kho se cho mien chung tu mot cai but de viet nham vao doi xe.
     */
    TransportCheckpointCoreFacts,
    WaitingSessionService,
    WaitingSessionRepository,
    WaitingAllowanceService,
    WaitingAllowanceRepository,
  ],
})
export class TransportCheckpointModule {}
