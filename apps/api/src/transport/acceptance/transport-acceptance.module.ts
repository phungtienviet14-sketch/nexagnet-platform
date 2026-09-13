import { Module } from '@nestjs/common';
import { OperationalDocumentAcceptanceEvidenceAdapter } from '../document/acceptance-evidence.adapter.js';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportModule } from '../transport.module.js';
import {
  AcceptanceCounterpartyFacts,
  AcceptanceCounterpartyFactsAdapter,
  AcceptanceEvidenceFacts,
  AcceptanceMovementFacts,
  AcceptanceMovementFactsAdapter,
  NoOperationalDocumentsAdapter,
} from './acceptance-facts.port.js';
import { AcceptanceRepository, InMemoryAcceptanceRepository } from './acceptance.repository.js';
import { CommercialAcceptanceService } from './acceptance.service.js';
import { PrismaAcceptanceRepository } from './prisma-acceptance.repository.js';

/**
 * Capability `transport-acceptance` — NGHIEM THU CHUNG TU / THUONG MAI (`#268` Lane I).
 *
 * ============================================================================================
 * MOT CAPABILITY RIENG, KHONG PHAI MOT PHAN CUA `transport-settlement`
 * ============================================================================================
 *
 * Vi chieu phu thuoc phai di MOT chieu, va chieu do la:
 *
 *     transport-settlement  ──doc──▶  transport-acceptance  ──doc──▶  transport-core
 *
 * Nhet truc nghiem thu vao trong `transport-settlement` se lam mot mien TAI CHINH mang them mot
 * duong GHI cua nguoi duyet chung tu, va lam cai cong (`#268` I5) nam cung cho voi cai no dang
 * canh — tuc khong con la mot cong.
 *
 * Con lam nguoc lai (`transport-acceptance` doc `transport-settlement`) se tao mot VONG module va,
 * te hon, mo mot duong tu tang nghiem thu nhin vao so tien. Tang nay khong can biet mot dong nao ve
 * tien de lam dung viec cua no.
 *
 * ============================================================================================
 * PHU THUOC CUNG cua `transport-settlement` — khai o `tenant.schema.ts`
 * ============================================================================================
 *
 * Mot khach bat quyet toan ma tat nghiem thu se KHONG BOOT DUOC. Do la cau tra loi co chu dich cho
 * cau hoi *"tat capability thi cong tai chinh co bien mat khong"*: khong co che do tat. Mot cong
 * tai chinh im lang vang mat vi mot dong cau hinh la dung thu khong duoc phep ton tai.
 *
 * ============================================================================================
 * `AcceptanceEvidenceFacts` — DONG DO DA DOI (`#243` F2 / `#279` O2 da vao `main`)
 * ============================================================================================
 *
 * Truoc `#279`, adapter mac dinh la `NoOperationalDocumentsAdapter` — FAIL-CLOSED, vi khong co mo
 * hinh chung tu van hanh nao tren `main`. Bay gio co, va DUNG MOT dong duoi day doi: khong mot
 * luat mien nao, khong mot bang nao, khong mot bai test nghiep vu nao phai doi. Do la ca ly do cai
 * cong nay ton tai truoc khi co thu de cam vao.
 *
 * Adapter that duoc tiem `optional: true` chu khong `useClass` thang, va do KHONG phai mot su than
 * trong thua. `transport-acceptance` la PHU THUOC BAT BUOC cua `transport-settlement`; buoc cung
 * vao `transport-checkpoint` se lam moi khach theo doi cong no phai bat ca quy trinh cong/can/phieu
 * giao cua cong ty B — dung dieu Quyet dinh kien truc #6 cam.
 *
 * Khach TAT `transport-checkpoint` ⇒ token vang mat ⇒ quay ve `NoOperationalDocumentsAdapter`.
 * Fail-closed, dung hinh dang `main` da co truoc tranche nay: duong can cu `DOCUMENT` dong lai, va
 * duong `EXTERNAL_PHYSICAL` van di duoc.
 */
@Module({
  imports: [PrismaModule, TransportModule],
  providers: [
    {
      provide: AcceptanceRepository,
      useFactory: (prisma: PrismaService): AcceptanceRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaAcceptanceRepository(prisma)
          : new InMemoryAcceptanceRepository(),
      inject: [PrismaService],
    },
    { provide: AcceptanceMovementFacts, useClass: AcceptanceMovementFactsAdapter },
    { provide: AcceptanceCounterpartyFacts, useClass: AcceptanceCounterpartyFactsAdapter },
    {
      provide: AcceptanceEvidenceFacts,
      useFactory: (
        documents?: OperationalDocumentAcceptanceEvidenceAdapter,
      ): AcceptanceEvidenceFacts => documents ?? new NoOperationalDocumentsAdapter(),
      inject: [{ token: OperationalDocumentAcceptanceEvidenceAdapter, optional: true }],
    },
    CommercialAcceptanceService,
  ],
  exports: [CommercialAcceptanceService, AcceptanceRepository, AcceptanceMovementFacts],
})
export class TransportAcceptanceModule {}
