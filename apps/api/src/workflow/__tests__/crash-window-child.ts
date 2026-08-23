import 'reflect-metadata';
import '../../config/load-dotenv.js';

/**
 * TIEN TRINH SE CHET — dung de do CUA SO SUP cua outbox giao dich.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI LA MOT TIEN TRINH RIENG, khong phai mot `try/catch` trong bai test:
 *
 * Thu dang do la "tien trinh chet giua commit va lan goi engine". Mot bai test mo phong dieu do
 * bang cach KHONG GOI dispatcher chi chung minh duoc rang no khong goi dispatcher. Muon do that,
 * tien trinh phai THAT SU bien mat — ke ca `finally`, ke ca `onModuleDestroy`, ke ca flush cua
 * Prisma — roi mot tien trinh KHAC doc lai Postgres va noi con lai gi.
 *
 * `SIGKILL` chinh minh la duong duy nhat lam duoc dieu do trong Node: `process.exit()` van chay
 * cac hook `exit`, con `SIGKILL` thi khong. Do la khac biet giua "tat" va "chet".
 *
 * ---------------------------------------------------------------------------
 * HAI CHE DO, doi xung nhau:
 *
 *   (mac dinh)              ghi nghiep vu + outbox -> COMMIT -> in ra -> CHET
 *   --abort-before-commit   ghi nghiep vu + outbox -> NEM  -> rollback -> thoat sach
 *
 * Che do thu hai la doi chung. Neu chi co che do dau, mot hien thuc ghi outbox NGOAI giao dich
 * van se qua duoc bai — vi hang van nam do. Chi khi bai thu hai doi hoi hang PHAI BIEN MAT thi
 * moi ep duoc hang nam DUNG trong giao dich cua nghiep vu.
 *
 * GIAO TIEP VOI CHA qua stdout, mot dong, tien to `CHILD` — khong dung IPC vi tien trinh nay
 * phai chay duoc bang tay khi can go roi.
 */

import { pathToFileURL } from 'node:url';
import { CRASH_WINDOW_CHAT_ID } from './workflow-it.harness.js';

const abortBeforeCommit = process.argv.includes('--abort-before-commit');

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module.js');
  const { PrismaService } = await import('../../config/prisma.service.js');
  const { WorkflowHandoffService } = await import('../workflow-handoff.service.js');

  const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), {
    logger: ['error'],
    abortOnError: false,
  });

  const prisma = context.get(PrismaService, { strict: false });
  const handoff = context.get(WorkflowHandoffService, { strict: false });

  // Tu day tro xuong la MOT giao dich duy nhat mang CA HAI thay doi.
  let orderId = '';
  let operationKey = '';
  try {
    await prisma.$transaction(async (tx) => {
      // ① TRANG THAI NGHIEP VU CHUAN TAC. `Order` la thuc the that cua GD1, khong phai mot bang
      //    do choi dung cho test — neu dung bang rieng thi bai nay khong noi duoc gi ve don hang.
      const order = await tx.order.create({
        data: {
          intent: 'dat_hang',
          senderType: 'dealer',
          chatId: CRASH_WINDOW_CHAT_ID,
          rawText: 'IT crash window — 10 x SP',
        },
      });
      orderId = order.id;

      // ② HANG OUTBOX, TRONG CUNG `tx`. Day la ca luan diem cua thiet ke: khong co cua so nao
      //    giua "don da commit" va "su kien da duoc ghi nhan", vi chung la CUNG mot commit.
      const result = await handoff.handoff(
        {
          workflowKey: 'integration-handoff',
          operation: 'sync',
          entityType: 'work-item',
          entityId: order.id,
        },
        tx,
      );
      operationKey = result.operationKey ?? '';

      if (abortBeforeCommit) {
        // NEM TRONG giao dich -> Prisma rollback CA HAI. Khong co duong nao de mot trong hai
        // song sot, va do la dieu bai doi chung phai chung minh.
        throw new Error('CHILD_ABORT_BEFORE_COMMIT');
      }
    });
  } catch (error) {
    if (abortBeforeCommit && (error as Error).message === 'CHILD_ABORT_BEFORE_COMMIT') {
      // Thoat SACH — o che do nay ta muon rollback dien ra binh thuong, khong phai chet.
      console.log(`CHILD ROLLED_BACK ${orderId || '-'} ${operationKey || '-'}`);
      await context.close();
      process.exit(0);
    }
    console.log(`CHILD FAILED ${(error as Error).message}`);
    await context.close();
    process.exit(1);
  }

  // DA COMMIT. In ra TRUOC khi chet — day la thu duy nhat cha nhan duoc tu tien trinh nay.
  console.log(`CHILD COMMITTED ${orderId} ${operationKey}`);

  // CHET NGAY. Khong `await` gi nua giua dong tren va dong nay: `WorkflowScheduler` cua chinh
  // tien trinh nay dang chay mot bo dem 5 giay, va no PHAI khong kip nhan hang. Cua so that su
  // o day la vai micro-giay, khong phai vai giay — mot luot `claimDue` bat dau truoc commit
  // khong the thay hang nay (READ COMMITTED), con mot luot bat dau sau commit thi khong kip.
  process.kill(process.pid, 'SIGKILL');
}

/**
 * CHI chay khi file nay LA diem vao cua tien trinh.
 *
 * Khong co cai chan nay, mot dong `import` vo hai tu bai test se boot ca `AppModule` roi SIGKILL
 * tien trinh dang import — tuc la giet worker cua vitest. Da xay ra that; trieu chung
 * (`ERR_IPC_CHANNEL_CLOSED`) khong chi ve nguyen nhan, nen cai chan nay dang gia hon ve ngoai
 * cua no.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
