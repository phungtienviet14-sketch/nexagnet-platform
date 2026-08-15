import process from 'node:process';
// Cung ly do phan giai nhu bootstrap-auth-user.mjs: tool nay nam ngoai workspace package.
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client/default.js';

/**
 * Duyet NOI DUNG GOI KHACH tu `draft` len `active` (thao tac VAN HANH, chay tay).
 *
 * VI SAO CAN: `ContentImportService` GAN CUNG `status: 'draft'` cho moi ban ghi nap tu goi khach —
 * co y, de khong ai nap mot manifest roi tu dong phat noi dung do ra cho khach. Nhung
 * `productAdvice` chi doc `active`, va cong `readiness` con doi MOI SKU phai co it nhat mot FAQ
 * hoac advice `active` truoc khi tinh den anh. Nen chung nao FAQ con `draft` thi anh cung khong ra.
 * Duyet tay qua UI la hang tram lan bam.
 *
 * VI SAO CHAY TRONG CONTAINER chu khong goi API: route `/settings/content/:kind/bulk-status` doi
 * phien MANAGER/ADMIN (AUTH_MODE=session). Chay o day dung quyen DB san co cua chinh tien trinh —
 * khong ai phai go mat khau vao dau ca.
 *
 * MAC DINH chi `image`. Duyet FAQ/advice/link la duyet CAU CHU se gui cho khach, phai la mot lenh
 * ro rang (`KINDS=faq,advice,link`) chu khong duoc di kem mot lenh duyet anh.
 *
 *   KINDS=image                 (mac dinh)
 *   KINDS=faq,advice,link
 *   KINDS=all
 *   TARGET_STATUS=reviewed      (ha nguoc de go noi dung khoi luong tu van)
 */
const STATUS_ORDER = ['draft', 'reviewed', 'approved', 'active'];
const TARGET = process.env.TARGET_STATUS ?? 'active';
const actor = process.env.APPROVE_ACTOR ?? 'deploy-operator';
const requested = (process.env.KINDS ?? 'all').toLowerCase();

if (!STATUS_ORDER.includes(TARGET)) throw new Error(`TARGET_STATUS khong hop le: ${TARGET}`);

const prisma = new PrismaClient();

/** `where` tach rieng vi bang Asset con chua video/pdf/catalog — duyet anh khong duoc cham vao do. */
const KINDS = {
  image: { model: () => prisma.asset, entityType: 'asset', where: { kind: 'image' } },
  faq: { model: () => prisma.fAQ, entityType: 'faq', where: {} },
  advice: { model: () => prisma.adviceContent, entityType: 'advice', where: {} },
  link: { model: () => prisma.contentLink, entityType: 'link', where: {} },
};

const selected =
  requested === 'all' ? Object.keys(KINDS) : requested.split(',').map((value) => value.trim());
for (const kind of selected) {
  if (!KINDS[kind]) throw new Error(`KINDS khong hop le: "${kind}"`);
}

const targetIndex = STATUS_ORDER.indexOf(TARGET);
try {
  for (const kind of selected) {
    const { model, entityType, where } = KINDS[kind];
    const rows = await model().findMany({
      where,
      select: { id: true, externalId: true, status: true, operatorEdited: true },
      orderBy: { externalId: 'asc' },
    });
    if (!rows.length) {
      process.stdout.write(`${kind.padEnd(7)} khong co ban ghi nao.\n`);
      continue;
    }

    // Trang thai dich la "dung status VA duoc bao ve". `operatorEdited` KHONG phai trang tri:
    // TenantPackContentBootstrap nap lai manifest o MOI lan boot va import gan cung `draft`; thu
    // duy nhat giu mot ban ghi khoi bi ha nguoc la co nay (import thay thi danh conflict, bo qua).
    // Lan chay dau 15/08/2026 chi doi `status` nen 102 anh bi tra ve `draft` ngay lan restart dau,
    // ma khong co gi bao loi ca.
    const pending = rows.filter(
      (row) => STATUS_ORDER.indexOf(row.status) < targetIndex || !row.operatorEdited,
    );
    if (!pending.length) {
      process.stdout.write(`${kind.padEnd(7)} ${rows.length} ban ghi — da o "${TARGET}", bo qua.\n`);
      continue;
    }

    const updated = await model().updateMany({
      where: { id: { in: pending.map((row) => row.id) } },
      data: { status: TARGET, operatorEdited: true },
    });
    await prisma.auditLog.create({
      data: {
        actor,
        action: 'content.bulk_status',
        entityType,
        after: {
          status: TARGET,
          changed: updated.count,
          externalIds: pending.map((row) => row.externalId),
        },
      },
    });
    process.stdout.write(
      `${kind.padEnd(7)} ${rows.length} ban ghi — da dua ${updated.count} len "${TARGET}".\n`,
    );
  }
  process.stdout.write('Xong. Khoi dong lai api (hoac POST /settings/content/reload) de nap lai.\n');
} finally {
  await prisma.$disconnect();
}
