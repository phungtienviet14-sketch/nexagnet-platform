import { Injectable } from '@nestjs/common';
import { UserRepository } from '../../auth/user.repository.js';
import type { AcceptanceActorView } from './acceptance.types.js';

/**
 * AI DA QUYET — tu ma tai khoan THO sang mot cai TEN (`#334`, UAT BUG-04).
 *
 * ============================================================================================
 * MA THO LA SU THAT KIEM TOAN; TEN LA MOT GOC NHIN
 * ============================================================================================
 *
 * `decidedBy` la `request.authUser.id` cua phien luc bam — va no PHAI o nguyen: doi ten mot tai
 * khoan, hay xoa no, khong duoc lam lich su noi rang mot nguoi khac da quyet. Nen phep phan giai
 * o day KHONG GHI gi: no doc nguon tai khoan luc DOC va dat mot nhan canh ma tho.
 *
 * Nguon la `UserRepository` — cung nguon ma phien dang nhap dung de biet `authUser` la ai. Khong
 * co ten nao viet cung o day: mot khach doi ten ke toan thi hang cho doi theo ngay lan doc sau.
 *
 * ============================================================================================
 * MA KHONG PHAN GIAI DUOC THI RA MOT CAU, KHONG RA CHINH CAI MA
 * ============================================================================================
 *
 * Tai khoan bi xoa khoi bang `User` de lai nhung ma khong con tro vao dau. In ma do ra lam nhan
 * chinh la dung loi UAT da bat. Cau du phong noi dung dieu nguoi doc can biet — "khong con tai
 * khoan nay" — con ma tho van nam trong `id` cho ai can doi chieu.
 */

/** Nhan cho mot ma khong con tro vao tai khoan nao. */
export const UNRESOLVED_ACTOR_LABEL = 'Tài khoản không còn hoạt động';

/** Nhan cho hang do buoc gieo du lieu mau ghi — cung chu voi `actorLabel()` cua `apps/web`. */
export const SEED_DATA_ACTOR_LABEL = 'Dữ liệu khởi tạo';

/**
 * Tac nhan cua buoc gieo du lieu mau — BAN SAO cua `DEMO_SEED_ACTOR` (`transport/demo/demo-seed.ts`).
 *
 * Ban sao chu khong import: tep gieo khong nam trong do thi nap cua ung dung, va keo no vao chi de
 * lay mot chuoi se keo theo ca bo du lieu mau. `acceptance-actor.spec.ts` khoa hai ban bang nhau.
 */
export const SEED_DATA_ACTOR_ID = 'demo-seed';

/**
 * Nhung gi tang ket thuc don DUOC biet ve mot tai khoan — va khong hon.
 *
 * Khong email, khong so dien thoai, khong bam mat khau: de goi ten mot nguoi quyet thi bon truong
 * nay la du, va mot kieu hep lam cho viec lo them mot truong phai la mot thay doi co chu y.
 */
export interface AcceptanceActorAccount {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly isDisabled: boolean;
}

/** CUA SO CHI DOC vao nguon tai khoan — cung khuon ba cong trong `acceptance-facts.port.ts`. */
export abstract class AcceptanceActorFacts {
  /** Tai khoan dang sau cac ma. Ma khong con tai khoan nao thi VANG MAT, khong nem. */
  abstract accountsFor(ids: readonly string[]): Promise<readonly AcceptanceActorAccount[]>;
}

/**
 * Doc `UserRepository` theo tung ma KHAC NHAU.
 *
 * Mot hang cho 100 don thuong chi co mot vai nguoi quyet, nen so lan doc bi chan boi so nguoi quyet
 * chu khong boi so dong. `UserRepository` chua co cong doc theo lo, va mo rong hop dong cua nen
 * tang xac thuc cho mot man hinh doc la khong dang voi con so do.
 */
@Injectable()
export class AcceptanceActorFactsAdapter extends AcceptanceActorFacts {
  constructor(private readonly users: UserRepository) {
    super();
  }

  async accountsFor(ids: readonly string[]): Promise<readonly AcceptanceActorAccount[]> {
    const distinct = [...new Set(ids)];
    const found = await Promise.all(distinct.map((id) => this.users.findById(id)));
    return found.flatMap((user) =>
      user === null
        ? []
        : [
            {
              id: user.id,
              name: user.name,
              username: user.username,
              isDisabled: user.disabledAt !== null,
            },
          ],
    );
  }
}

/**
 * Nhan cua MOT nguoi quyet. Ham THUAN — moi nhanh kiem duoc khong can CSDL.
 *
 * Tai khoan da KHOA van giu ten: nguoi do da that su quyet, va khoa tai khoan sau do khong doi su
 * that ay. `kind` noi rieng no da khoa, cho ai can phan biet.
 */
export const acceptanceActorView = (
  id: string,
  account: AcceptanceActorAccount | undefined,
): AcceptanceActorView => {
  if (id === SEED_DATA_ACTOR_ID) return { id, label: SEED_DATA_ACTOR_LABEL, kind: 'SEED_DATA' };

  const readable = account === undefined ? '' : account.name.trim() || account.username.trim();
  if (account === undefined || readable.length === 0) {
    return { id, label: UNRESOLVED_ACTOR_LABEL, kind: 'UNRESOLVED' };
  }
  return { id, label: readable, kind: account.isDisabled ? 'DISABLED_USER' : 'USER' };
};
