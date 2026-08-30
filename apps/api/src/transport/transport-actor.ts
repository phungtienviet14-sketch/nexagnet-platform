import { UnauthorizedException } from '@nestjs/common';
import { isInternalServiceRequest } from '../auth/internal-service.guard.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { loadFoundationEnv } from '../config/foundation-env.js';

/** Du cho moi ten dang nhap that; du ngan de mot header bia khong phinh duoc ban ghi nao. */
const MAX_ACTOR_LENGTH = 64;
const SAFE_ACTOR = /^[\w.@-]+$/;

/** Danh tinh cua mot TIEN TRINH noi bo, khong phai cua mot nguoi. Khong bao gio den tu header. */
export const INTERNAL_SERVICE_ACTOR = 'internal-service';

/** Duong lui cua che do khong-phien khi ben goi khong khai gi ca. */
export const ANONYMOUS_TRANSPORT_ACTOR = 'operator';

/**
 * AI da ky vao mot dong lich su tai chinh van tai.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG THANG `@Headers('x-actor')` NHU T2 DA LAM:
 *
 * Gia tri nay di vao `DriverFundEntry.recordedBy`, `TripExpense.recordedBy`,
 * `DriverFundPeriod.closedBy/reopenedBy`, `FundPeriodSnapshot.takenBy` va `AuditLog.actor` — tuc
 * vao nhung hang KHONG SUA DUOC (`INV-20`). O che do `AUTH_MODE=session`, mot nguoi dung vai
 * `ACCOUNTING` chi can them mot dong header:
 *
 * ```text
 * POST /transport/costing/driver-fund/advances
 * x-actor: giam-doc
 * ```
 *
 * va so sach se noi vinh vien rang Giam doc da ky lenh ung tien do. Khong loi, khong canh bao —
 * chi mot dong lich su tai chinh mang ten sai nguoi, va `INV-20` bao dam khong ai sua lai duoc.
 *
 * Nen o che do co phien, danh tinh CHI den tu `request.authUser` do may chu tu dung len; header
 * `x-actor` bi BO QUA hoan toan, khong phai "uu tien thap hon".
 *
 * ---------------------------------------------------------------------------
 * BA CHE DO, BA CAU TRA LOI RO RANG — khong che do nao roi ve mot mac dinh im lang:
 *
 * ```text
 * AUTH_MODE=session            -> request.authUser.username      | khong co -> 401 (that bai DONG)
 * AUTH_MODE=session + noi bo   -> 'internal-service' (co dinh)   |
 * AUTH_MODE=api-key | none     -> x-actor DA LOC                 | khong dat -> 'operator'
 * ```
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
 *
 * ---------------------------------------------------------------------------
 * VI SAO VAN PHAI LOC `x-actor` o che do khong-phien: gia tri nay cung chay vao
 * `TraceAnchors.actor`, ma `TelemetryService.envelope()` dung `traceSnapshot()` THO — neo KHONG di
 * qua `sanitizeAttributes`. Cung ly le da viet o `orders.controller.ts`.
 */
export function transportActorOf(request: AuthenticatedRequest, claimedHeader?: string): string {
  const authMode = loadFoundationEnv().AUTH_MODE;

  if (authMode === 'session') {
    const verified = request.authUser?.username;
    if (verified) return verified;
    // Duong dich vu-dich vu da qua `InternalServiceGuard` — mot tien trinh, khong mot nguoi. Ten
    // co dinh chu khong lay tu header: mot worker khong duoc tu khai minh la ai.
    if (isInternalServiceRequest(request)) return INTERNAL_SERVICE_ACTOR;
    // THAT BAI DONG. Mot lenh ghi tai chinh khong co nguoi chiu trach nhiem thi khong duoc ghi,
    // chu khong duoc roi ve `operator` — mot cai ten khong truy nguoc duoc ve ai.
    throw new UnauthorizedException('Thao tac van tai doi mot phien dang nhap da xac thuc');
  }

  return sanitizedFallbackActor(claimedHeader);
}

/**
 * Duong `AUTH_MODE=api-key`/`none` (demo, CI, dev offline): khong co phien nao de doi chieu, nen
 * `x-actor` la thu duy nhat con lai. Loc chat va roi ve `operator` khi khong dat — KHONG BAO GIO
 * de trong: mot thao tac khong co nguoi chiu trach nhiem la mot thao tac khong kiem toan duoc.
 */
function sanitizedFallbackActor(claimedHeader?: string): string {
  const claimed = (claimedHeader ?? '').trim();
  return claimed.length > 0 && claimed.length <= MAX_ACTOR_LENGTH && SAFE_ACTOR.test(claimed)
    ? claimed
    : ANONYMOUS_TRANSPORT_ACTOR;
}
