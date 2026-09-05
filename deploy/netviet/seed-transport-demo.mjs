import process from 'node:process';
// This deploy tool lives outside a pnpm workspace package. Resolve through apps/api, which owns
// both dependencies, instead of relying on a forbidden root-hoist that differs by pnpm layout.
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client/default.js';
import { argon2id, hash } from '../../apps/api/node_modules/argon2/argon2.cjs';
import { DemoTenantGuardError } from '../../apps/api/dist/transport/demo/demo-guard.js';
import {
  backfillDemoDriverLogins,
  seedTransportDemoMonth,
} from '../../apps/api/dist/transport/demo/demo-seed.js';

/**
 * GIEO THANG VAN HANH MAU cho goi khach dang chay (T8/#90).
 *
 * ---------------------------------------------------------------------------
 * BUOC NAY CHAY CHO MOI STACK, VA DO LA LY DO NO PHAI IM LANG VOI KHACH THAT.
 *
 * `deploy-stack.sh` khong biet stack no dang dung la goi mau hay goi khach — no chay cung mot day
 * lenh cho ultty, amico, wata va transport-preview. Nen mot goi khach that di qua day PHAI ra ve
 * voi ma thoat 0: bien mot lan deploy cua khach thanh do vi mot buoc chi phuc vu ban demo la doi
 * cai gia cua tinh nang nay sang nguoi khong dung no.
 *
 * `DemoTenantGuardError` la duong ra do — mot LOAI loi rieng chu khong phai mot chuoi thong bao.
 * Bat theo loai thi khong con kha nang mot loi THAT (goi khach hong, DB khong ket noi duoc) bi doc
 * nham thanh "a, khach nay khong phai goi mau" roi bi nuot mat.
 *
 * ---------------------------------------------------------------------------
 * MAT KHAU LAI XE KHONG NAM TRONG KHO MA NGUON.
 *
 * Thieu `TRANSPORT_DEMO_DRIVER_PASSWORD` thi VAN gieo — chi khong tao tai khoan dang nhap, va noi
 * ro dieu do ra log. Du lieu van tai day du van co gia tri de xem; rieng be mat lai xe thi chua ai
 * dang nhap duoc. Mot mat khau mac dinh nhung san trong tep nay se la mot thong tin dang nhap
 * duoc cong bo cong khai tren mot stack co that.
 */

const prisma = new PrismaClient();
try {
  const hashPassword = (plain) => hash(plain, { type: argon2id });
  const result = await seedTransportDemoMonth(prisma, { hashPassword });

  if (result.skipped) {
    process.stdout.write(
      `Da co ${result.counts.transportTrip} chuyen trong DB — Postgres la nguon su that, khong gieo lai.\n`,
    );
    // "Gieo truoc, cau hinh mat khau sau" phai la mot trinh tu chay duoc: khong co buoc nay thi
    // mot lan gieo som (chua co bien mat khau) se khoa be mat lai xe lai vinh vien.
    const created = await backfillDemoDriverLogins(prisma, { hashPassword });
    if (created > 0) {
      process.stdout.write(`Da tao bu ${created} tai khoan dang nhap cho lai xe.\n`);
    }
  } else {
    const summary = Object.entries(result.counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    process.stdout.write(`Da gieo thang van hanh mau (moc ${result.anchor}): ${summary}\n`);
    if (result.driverLoginNote !== null) process.stdout.write(`${result.driverLoginNote}\n`);
  }
} catch (error) {
  if (error instanceof DemoTenantGuardError) {
    process.stdout.write('Goi khach nay khong phai goi mau — bo qua buoc gieo du lieu van tai.\n');
  } else {
    throw error;
  }
} finally {
  await prisma.$disconnect();
}
