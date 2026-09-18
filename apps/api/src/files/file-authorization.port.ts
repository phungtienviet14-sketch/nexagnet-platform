import type { FileAction, FileLink, FileRecord } from './file.types.js';

/**
 * CONG QUYEN THEO MIEN — `#287` P2/P6.
 *
 * ============================================================================================
 * `knowing File ID != permission to read File`
 * ============================================================================================
 *
 * Nen tang tep biet mot tep TON TAI va biet no dang gan vao nhung doi tuong nao. No KHONG biet — va
 * khong duoc phep doan — rang mot nguoi cu the co duoc xem doi tuong do hay khong. Cau do chi mot
 * cho tra loi dung: chinh mien so huu doi tuong.
 *
 * `#287` P6: *"generic File endpoint cannot bypass domain permission"*. Cach chac chan nhat de giu
 * dieu do khong phai mot bai test, ma la KHONG CO DUONG NAO trong `FileService` tu ket luan lay.
 *
 * ============================================================================================
 * MOT TEN KHONG AI DANG KY = TU CHOI
 * ============================================================================================
 *
 * `businessOwnerType` la chuoi tu do. Neu khong mien nao dang ky cai ten do,
 * `FileAuthorizationService` TU CHOI — khong "cho qua vi khong biet". Do la nghia den cua
 * fail-closed, va no con che them mot duong tan cong: mot lien ket ghi voi mot `businessOwnerType`
 * bia ra se khong mo duoc tep nao.
 */

/** Cau hoi dat cho mien. Mien nhan CA hang lien ket, vi `businessOwnerId` mot minh la chua du. */
export interface FileDomainAuthorizationRequest {
  readonly link: FileLink;
  readonly action: FileAction;
  readonly authUserId: string;
}

/**
 * CAU TRA LOI cua mien — mot UNION CO NHAN, va ba nhanh chu khong hai.
 *
 * `LOCKED` tach khoi `DENIED` vi `#287` P3 bat bien 6 (*"domain may deny withdrawal after immutable
 * evidence boundary"*) va muc 5 cua danh sach nghiem thu cuoi doi phan biet duoc chung: mot ben la
 * "ban khong co quyen", mot ben la "khong AI con quyen nua, ke ca nguoi da tao". Gop lai se lam mot
 * to bang chung da chot trong giong mot loi phan quyen, va nguoi dung se di xin quyen.
 */
export type FileDomainVerdict =
  { readonly kind: 'GRANTED' } | { readonly kind: 'DENIED' } | { readonly kind: 'LOCKED' };

/**
 * MOT MIEN TRA LOI CHO CHINH NO.
 *
 * `businessOwnerType` la ten mien do tu khai. `FileDomainAuthorizerRegistry` tu choi hai lop cung
 * khai mot ten — hai cau tra loi cho cung mot cau hoi thi cai long hon se la cai that su chay.
 */
export abstract class FileDomainAuthorizer {
  abstract readonly businessOwnerType: string;
  abstract authorize(request: FileDomainAuthorizationRequest): Promise<FileDomainVerdict>;
}

/**
 * SO DANG KY — mot ban do ten mien -> nguoi tra loi.
 *
 * ============================================================================================
 * VI SAO LA MOT SO DANG KY GHI DUOC, khong mot mang tiem san
 * ============================================================================================
 *
 * Nguoi tra loi song trong module cua MIEN (vd `TransportDocumentModule`) vi no can kho cua mien
 * do. Nen tang tep thi nam o `foundation` va duoc nap TRUOC moi mien. Mot mang tiem vao luc dung
 * `FilesModule` se buoc nen tang phai biet ten tung mien — tuc dung dieu P2 cam.
 *
 * Nen chieu phu thuoc bi DAO: mien tu dang ky. `register()` nem khi mot ten bi khai hai lan, va
 * `authorizerFor()` tra `null` cho ten la — hai dieu do gop lai giu cho so dang ky khong bao gio am
 * tham tro nen de dai hon.
 */
export abstract class FileDomainAuthorizerRegistry {
  abstract register(authorizer: FileDomainAuthorizer): void;
  abstract authorizerFor(businessOwnerType: string): FileDomainAuthorizer | null;
}

export class InMemoryFileDomainAuthorizerRegistry extends FileDomainAuthorizerRegistry {
  private readonly authorizers = new Map<string, FileDomainAuthorizer>();

  register(authorizer: FileDomainAuthorizer): void {
    const existing = this.authorizers.get(authorizer.businessOwnerType);
    if (existing && existing !== authorizer) {
      throw new Error(
        `Da co nguoi tra loi quyen cho "${authorizer.businessOwnerType}" — hai cau tra loi cho mot cau hoi`,
      );
    }
    this.authorizers.set(authorizer.businessOwnerType, authorizer);
  }

  authorizerFor(businessOwnerType: string): FileDomainAuthorizer | null {
    return this.authorizers.get(businessOwnerType) ?? null;
  }
}

/** Tep chua gan vao dau ca — chi nguoi tao dung toi duoc. Xem `FileAuthorizationService`. */
export function isCreator(file: FileRecord, authUserId: string): boolean {
  return authUserId.length > 0 && file.createdBy === authUserId;
}
