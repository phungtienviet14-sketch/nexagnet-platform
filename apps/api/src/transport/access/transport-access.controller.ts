import { Controller, Get, Req } from '@nestjs/common';
import { currentUser } from '../../auth/auth.controller.js';
import type { UserRole } from '../../auth/auth.types.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { TRANSPORT_ACTIONS, roleCanPerform, type TransportAction } from '../transport-actions.js';

export interface TransportAccessView {
  readonly role: UserRole;
  /** Sap xep on dinh de hai lan hoi cung mot vai cho ra cung mot chuoi byte. */
  readonly actions: readonly TransportAction[];
}

/**
 * Nhung thao tac mien van tai ma MOT VAI duoc lam — tinh bang CHINH `roleCanPerform`, ham ma
 * `TransportActionGuard` goi de chan. Hai ben doc mot bang, nen cau tra loi o day khong the lech voi
 * cong that.
 *
 * KHONG gom `STAKEHOLDER_SCOPE_ACTIONS`: guard cho chung di qua tang vai vi khong vai nao noi duoc
 * gi ve chung, con cong that la mot HANG DU LIEU (`AssetOwnershipScopeService`). Liet ke chung o day
 * se hua voi moi nguoi mot man hinh ma phan lon se nhan 403.
 *
 * KHI `#395` MANG QUYEN THEO TUNG NGUOI: doi ham nay sang bo giai quyen theo nguoi o DUNG cho guard
 * doc, giu nguyen hop dong `{ role, actions }`. Mot ban tinh rieng cho route nay la mot su that thu
 * hai ve quyen.
 */
export function transportAccessFor(role: UserRole): TransportAccessView {
  return {
    role,
    actions: TRANSPORT_ACTIONS.filter((action) => roleCanPerform(role, action)).sort(),
  };
}

/**
 * QUYEN CUA CHINH TOI trong mien van tai — de ung dung native AN nut thay vi tu giu bang quyen.
 *
 * Web dang giu mot ban guong (`experiences/transport-operations/transport-actions.ts`) va mot bai
 * kiem doi chieu; ung dung tren dien thoai khong duoc lam vay, vi ban da cai se khong cap nhat cung
 * may chu. Nen may chu noi thang.
 *
 * Moi nguoi DA DANG NHAP deu hoi duoc — khong `@RequiresTransportAction`, khong `@Roles`: hoi "toi
 * lam duoc gi" khong phai mot thao tac can quyen. Danh tinh chi tu phien; khong tham so nao.
 *
 * O che do khong-phien (`api-key`/`none`) khong co "toi" de tra loi, nen route nay tra 401 thay vi
 * doan mot vai — ung dung native chi chay tren `AUTH_MODE=session`.
 */
@Controller('transport')
export class TransportAccessController {
  @Get('access')
  access(@Req() request: AuthenticatedRequest): TransportAccessView {
    return transportAccessFor(currentUser(request).role);
  }
}
