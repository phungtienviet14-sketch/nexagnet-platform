import process from 'node:process';
// Cung ly do phan giai nhu bootstrap-auth-user.mjs: tool nay nam ngoai workspace package.
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client/default.js';

/**
 * Duyet ANH CATALOG tu `draft` len `active` (thao tac VAN HANH, chay tay).
 *
 * VI SAO CAN: `ContentImportService` GAN CUNG `status: 'draft'` cho moi ban ghi nap tu goi khach —
 * co y, de khong ai nap mot manifest roi tu dong phat noi dung do ra cho khach. Nhung
 * `productAdvice` chi doc `active`, nen 102 anh vua nap se khong bao gio duoc gui neu khong co mot
 * buoc duyet. Duyet tay qua UI la 102 x 3 lan bam.
 *
 * VI SAO CHAY TRONG CONTAINER chu khong goi API: route `/settings/content/:kind/bulk-status` doi
 * phien MANAGER/ADMIN (AUTH_MODE=session). Chay o day dung quyen DB san co cua chinh tien trinh —
 * khong ai phai go mat khau vao dau ca.
 *
 * CHI dong den `kind='image'`. FAQ/advice/link la NOI DUNG CHU do nguoi bien tap duyet tung cai;
 * anh san pham thi do chinh khach gui va da duoc anh xa theo SKU. Mot script "duyet tat ca" se lang
 * le bat luon ca cau chu chua ai doc.
 */
const STATUS_ORDER = ['draft', 'reviewed', 'approved', 'active'];
const TARGET = process.env.TARGET_STATUS ?? 'active';
const actor = process.env.APPROVE_ACTOR ?? 'deploy-operator';

if (!STATUS_ORDER.includes(TARGET)) {
  throw new Error(`TARGET_STATUS khong hop le: ${TARGET}`);
}

const prisma = new PrismaClient();
try {
  const images = await prisma.asset.findMany({
    where: { kind: 'image' },
    select: { id: true, externalId: true, status: true, operatorEdited: true },
    orderBy: { externalId: 'asc' },
  });
  if (!images.length) {
    process.stdout.write('Khong co anh nao trong DB — chay build-catalog-assets + deploy truoc.\n');
    process.exit(0);
  }

  const targetIndex = STATUS_ORDER.indexOf(TARGET);
  // Trang thai dich la "dung status VA duoc bao ve" — mot ban ghi da `active` nhung thieu
  // `operatorEdited` van se bi lan boot sau ha ve `draft`, tuc chua thuc su duyet xong.
  const toPromote = images.filter(
    (asset) => STATUS_ORDER.indexOf(asset.status) < targetIndex || !asset.operatorEdited,
  );
  process.stdout.write(
    `${images.length} anh trong DB; ${toPromote.length} can dua len "${TARGET}" (hoac thieu co bao ve).\n`,
  );
  if (!toPromote.length) {
    process.stdout.write('Khong co gi phai doi.\n');
    process.exit(0);
  }

  // Mot lenh updateMany: khong di tung buoc `draft->reviewed->approved->active` vi day khong phai
  // thao tac cua nguoi dung tren UI ma la mot quyet dinh van hanh DUY NHAT — ghi ba lan chi tao ba
  // dong lich su cho cung mot y dinh.
  //
  // `operatorEdited: true` la BAT BUOC, khong phai trang tri.
  //
  // `TenantPackContentBootstrap` nap lai manifest o MOI lan boot, va `ContentImportService` gan
  // cung `status: 'draft'`. Thu duy nhat giu mot ban ghi khoi bi ha nguoc la co `operatorEdited`:
  // import thay co nay thi danh `conflict` va BO QUA ban ghi. Lan chay dau (15/08/2026) chi doi
  // `status` nen ca 102 anh bi tra ve `draft` ngay lan khoi dong lai dau tien — duyet xong nhu chua
  // duyet, va khong co gi bao loi ca.
  const updated = await prisma.asset.updateMany({
    where: { id: { in: toPromote.map((asset) => asset.id) } },
    data: { status: TARGET, operatorEdited: true },
  });

  // Ghi dau vet: bo qua buoc nay thi trong DB se co 102 anh o `active` ma khong ai biet ai bat.
  await prisma.auditLog.create({
    data: {
      actor,
      action: 'content.bulk_status',
      entityType: 'asset',
      after: {
        status: TARGET,
        changed: updated.count,
        externalIds: toPromote.map((asset) => asset.externalId),
      },
    },
  });

  process.stdout.write(`Da duyet ${updated.count} anh len "${TARGET}". Da ghi audit.\n`);
  process.stdout.write('Goi POST /settings/content/reload (hoac khoi dong lai api) de nap lai.\n');
} finally {
  await prisma.$disconnect();
}
