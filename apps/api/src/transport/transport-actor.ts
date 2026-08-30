import { UnauthorizedException } from '@nestjs/common';
import { isInternalServiceRequest } from '../auth/internal-service.guard.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { loadFoundationEnv } from '../config/foundation-env.js';

/** Danh tinh cua mot TIEN TRINH noi bo, khong phai cua mot nguoi. Dau do may chu tu dat. */
export const INTERNAL_SERVICE_ACTOR = 'internal-service';

/**
 * Ten CO DINH cua che do khong-phien (`api-key` / `none`: demo, CI, dev offline).
 *
 * Khong co phien thi khong co ai de goi ten. Cai ten nay noi dung mot dieu ma he thong BIET:
 * "mot thao tac vien qua mot ban chay khong bat xac thuc". No khong gia vo biet nhieu hon the.
 */
export const SYSTEM_TRANSPORT_ACTOR = 'operator';

/**
 * AI da ky vao mot dong lich su tai chinh van tai.
 *
 * ---------------------------------------------------------------------------
 * CHI CO BA NGUON DANH TINH, VA CA BA DEU DO MAY CHU DUNG LEN:
 *
 * ```text
 * yeu cau da qua `InternalServiceGuard`  -> 'internal-service'  (dau la mot `Symbol` cuc bo)
 * AUTH_MODE=session + `request.authUser` -> username da xac thuc (do `SessionAuthGuard` dat)
 * AUTH_MODE=session, khong co phien      -> 401, THAT BAI DONG
 * AUTH_MODE=api-key | none               -> 'operator' (co dinh)
 * ```
 *
 * KHONG co nhanh thu tu nao doc mot header. Ham nay khong nhan tham so nao ngoai `request`, nen
 * viec "truyen `x-actor` vao danh tinh kiem toan" khong phai la mot lua chon bi cam — no la mot
 * loi bien dich.
 *
 * ---------------------------------------------------------------------------
 * VI SAO `x-actor` KHONG DUOC PHEP DEN DAY, KE CA DA LOC:
 *
 * Gia tri nay di vao `DriverFundEntry.recordedBy`, `TripExpense.recordedBy`,
 * `DriverFundPeriod.closedBy/reopenedBy`, `FundPeriodSnapshot.takenBy` va `AuditLog.actor` — tuc
 * vao nhung hang KHONG SUA DUOC (`INV-20`).
 *
 * Ban T3R dau tien da bit duong nay o che do `session`, nhung o `AUTH_MODE=api-key`/`none` van
 * lay `x-actor` DA LOC lam danh tinh. Do van la mot lo hong, va ly do rat gon:
 *
 *   LOC mot chuoi chi chung minh chuoi do VO HAI VE HINH THUC.
 *   No khong chung minh nguoi gui dung LA cai ten do.
 *
 * `giam-doc` qua duoc moi bo loc — no dung charset, dung do dai, khong ky tu la. Roi so sach ghi
 * vinh vien rang Giam doc da ky lenh ung tien, va `INV-20` bao dam khong ai sua lai duoc. Mot dong
 * lich su tai chinh mang ten sai nguoi con te hon mot dong khong biet ten ai: cai thu hai noi that
 * rang he thong khong biet; cai thu nhat noi doi mot cach tu tin.
 *
 * Vay nen o che do khong-phien, cau tra loi la mot cai ten CO DINH. Ban demo mat kha nang phan
 * biet hai thao tac vien — dung, va do la dieu phai chap nhan: mot ban chay khong bat xac thuc thi
 * KHONG CO du lieu de phan biet ho. Muon phan biet thi bat `AUTH_MODE=session`, do la cho duy nhat
 * cau hoi "ai" co mot cau tra loi kiem chung duoc.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG CON BO LOC CHUOI o day nua:
 *
 * Ban truoc phai loc vi `x-actor` la du lieu nguoi ngoai gui. Gio ca ba nguon deu do may chu dung
 * len: hai hang so, va mot `username` da qua `usernameSchema` (`auth/auth.schemas.ts` —
 * `^[a-z0-9][a-z0-9._-]*$/i`, 3..64) o duong TAO NGUOI DUNG DUY NHAT (`AuthService.createUser()`).
 * Giu lai mot bo loc khong con gi de loc se ngu y sai rang o day van co du lieu khong tin duoc.
 *
 * Rang buoc do con quan trong cho mot ly do thu hai: gia tri nay chay vao `TraceAnchors.actor`, ma
 * `TelemetryService.envelope()` dung `traceSnapshot()` THO — neo KHONG di qua `sanitizeAttributes`.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA `username` CHU KHONG PHAI `authUser.id`:
 *
 * `AuditLog.actor` la mot cot chuoi DUNG CHUNG cho ca nen tang, va moi be mat khac
 * (`orders.controller.ts`, `master-data.controller.ts`) da ghi ten dang nhap vao do. Dat rieng
 * mien van tai ghi UUID se tao ra HAI tu vung actor trong cung mot bang — bo loc `@@index([actor])`
 * khi do tra ve mot nua su that, va do la mot buoc LUI cho viec kiem toan chu khong phai mot buoc
 * tien. Danh tinh ben vung truoc viec doi ten dang nhap doi mot mo hinh actor o TANG NEN TANG
 * (`AuditLog.actorUserId`), khong phai mot ngoai le rieng cua van tai — xem #94 §8: khong don dep
 * Platform trong PR nay.
 */
export function transportActorOf(request: AuthenticatedRequest): string {
  // Tien trinh noi bo. Dau nay do CHINH `InternalServiceGuard` dat sau khi doi khoa dich vu, va no
  // la mot `Symbol` cuc bo cua module do — mot ben goi ngoai khong tu gan vao than yeu cau duoc.
  if (isInternalServiceRequest(request)) return INTERNAL_SERVICE_ACTOR;

  // Nguoi that. `SessionAuthGuard` la cho DUY NHAT dat `authUser`, va no tu rut lui hoan toan khi
  // `AUTH_MODE !== 'session'` — nen truong nay khong bao gio den tu mot ban chay khong xac thuc.
  const verified = request.authUser?.username;
  if (verified) return verified;

  // THAT BAI DONG. Mot lenh ghi tai chinh khong co nguoi chiu trach nhiem thi khong duoc ghi, chu
  // khong duoc roi ve mot cai ten chung — o che do co phien, "khong biet ai" la mot loi.
  if (loadFoundationEnv().AUTH_MODE === 'session') {
    throw new UnauthorizedException('Thao tac van tai doi mot phien dang nhap da xac thuc');
  }

  return SYSTEM_TRANSPORT_ACTOR;
}
