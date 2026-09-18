/**
 * TOKEN DI RIENG cua nen tang tep.
 *
 * ============================================================================================
 * VI SAO DAU VET CUA NEN TANG TEP KHONG DUNG THANG TOKEN `AuditLogService`
 * ============================================================================================
 *
 * `AuditLogService` da duoc CUNG CAP o nhieu module: `OperationalSettingsModule` (`operations`),
 * `TransportModule`, `NotificationModule`. Do la co y — mot capability khong duoc bat `operations`
 * van phai ghi duoc dau vet.
 *
 * Nhung `app.get(AuditLogService, { strict: false })` la mot phep tra cuu TOAN CUC, va khi nhieu
 * module cung cung cap mot token thi cai duoc tra ve phu thuoc THU TU DANG KY. Them mot nha cung
 * cap thu tu — o mot module `foundation`, tuc duoc nap TRUOC moi capability — se doi cai thang.
 *
 * Do khong phai mot suy doan: `sales-handoff-trace-continuity.spec.ts` boot ca ung dung roi tra cuu
 * dung kieu do, va no DO ngay khi `FilesModule` dang ky them mot `AuditLogService` — bai kiem nhin
 * vao mot kho dau vet rong trong khi nghiep vu da ghi vao mot kho khac.
 *
 * Nen nen tang tep dung mot token RIENG. No van la mot `AuditLogService` that, van ghi vao cung
 * mot bang khi `PERSISTENCE=prisma`; cai thay doi duy nhat la no khong con tranh cho voi ai o phep
 * tra cuu toan cuc.
 */
export const FILE_AUDIT_LOG = Symbol('FILE_AUDIT_LOG');
