import { Injectable } from '@nestjs/common';
import {
  FileDomainAuthorizerRegistry,
  isCreator,
  type FileDomainVerdict,
} from './file-authorization.port.js';
import { FileRepository } from './file.repository.js';
import type { FileAction, FileLink, FileRecord } from './file.types.js';

/**
 * CONG QUYEN cua nen tang tep — `#287` P2/P6.
 *
 * ============================================================================================
 * BA LUAT, va tat ca deu la FAIL-CLOSED
 * ============================================================================================
 *
 *  1. TEP CHUA TUNG GAN VAO DAU — chi nguoi tao dung toi duoc. Do la trang thai `STAGED` binh
 *     thuong: byte vua len, chua ai khai no la bang chung cua cai gi. Cho phep nguoi khac doc se
 *     bien mot ma doan trung thanh mot lan doc du lieu cua nguoi la.
 *
 *     "CHUA TUNG", khong "khong con": mot tep da bi rut van co lien ket (da go) trong so sach, nen
 *     no KHONG roi ve nhanh nay. Xem chu thich trong `authorize()`.
 *
 *  2. TEP DA GAN — MIEN quyet, khong phai nguoi tao. Day la cho de nhat de lam sai: giu lai mot
 *     "cua sau cho nguoi tai len" nghe rat hop ly, va no pha dung bai kiem ma `#287` P6 dat ra
 *     (*"Accounting may read evidence ... but does not gain permission to mutate immutable source
 *     proof"*). Mot khi to giay da vao ho so, no khong con la tep cua ai ca.
 *
 *  3. TEN SO HUU KHONG AI DANG KY — TU CHOI. Khong "cho qua vi khong biet".
 *
 * ============================================================================================
 * DOC CAN MOT LIEN KET DONG Y; RUT CAN TAT CA DONG Y
 * ============================================================================================
 *
 * Bat doi xung nay la co y.
 *
 * Doc: mot tep co the la bang chung cua hai doi tuong. Ai duoc xem MOT trong hai thi da duoc xem to
 * giay do roi — doi ca hai cung dong y se chan dung nhung nguoi co quyen that.
 *
 * Rut: mot lan rut go MOI lien ket cua tep (xem `FileRepository.withdraw`). Neu chi can mot mien
 * dong y, thi nguoi nam quyen tren doi tuong A se go duoc to bang chung ra khoi ho so cua doi tuong
 * B — ma khong ai ben B biet. Nen rut doi TAT CA, va MOT tieng `LOCKED` la du de dung lai.
 */

/**
 * KET QUA — `LOCKED` tach khoi `DENIED`, xem `FileDomainVerdict`.
 *
 * `reason` cua nhanh `DENIED` gop hai tinh huong ("khong co" va "khong phai cua ban") vao MOT ma o
 * tang goi — `#287` P6 *"fails closed without useful enumeration"*.
 */
export type FileAuthorizationOutcome =
  { readonly kind: 'GRANTED' } | { readonly kind: 'DENIED' } | { readonly kind: 'LOCKED' };

const GRANTED: FileAuthorizationOutcome = { kind: 'GRANTED' };
const DENIED: FileAuthorizationOutcome = { kind: 'DENIED' };
const LOCKED: FileAuthorizationOutcome = { kind: 'LOCKED' };

@Injectable()
export class FileAuthorizationService {
  constructor(
    private readonly files: FileRepository,
    private readonly registry: FileDomainAuthorizerRegistry,
  ) {}

  async authorize(
    file: FileRecord,
    action: FileAction,
    authUserId: string,
  ): Promise<FileAuthorizationOutcome> {
    // Mot danh tinh rong khong bao gio la mot danh tinh. Kiem o day chu khong tin vao guard: mot
    // tuyen moi quen `requireAuthUserId` se bi chan o cong nay thay vi di qua nhu nguoi tao.
    if (authUserId.length === 0) return DENIED;

    // MOI lien ket, khong chi cai dang hieu luc — va do la mot sua loi that, khong mot chi tiet.
    //
    // Mot lan rut go TAT CA lien ket cua tep (`FileRepository.withdraw`). Neu cong nay chi nhin
    // lien ket dang hieu luc, thi ngay sau lan rut do tep quay ve nhanh "chua gan vao dau" — tuc
    // NGUOI TAI LEN lay lai duoc quyen ma mien vua tuoc di, va mien thi mat luon quyen doc chinh
    // thu ho vua rut. Mot to bang chung da vao ho so thi khong bao gio tro lai thanh tep cua ai.
    const links = await this.files.linksOf(file.id);
    if (links.length === 0) return isCreator(file, authUserId) ? GRANTED : DENIED;

    return action === 'WITHDRAW'
      ? this.everyDomainAgrees(links, action, authUserId)
      : this.anyDomainAgrees(links, action, authUserId);
  }

  /** DOC/GAN: mot tieng dong y la du. Xem khoi chu thich cua lop. */
  private async anyDomainAgrees(
    links: readonly FileLink[],
    action: FileAction,
    authUserId: string,
  ): Promise<FileAuthorizationOutcome> {
    for (const link of links) {
      const verdict = await this.ask(link, action, authUserId);
      // `LOCKED` o duong doc duoc doc thanh "khong dong y": mien duoc hoi ve `READ`/`ATTACH` thi
      // phai tra loi ve chinh hanh dong do. Doc no thanh dong y se bien mot bang chung da chot
      // trong thanh mot tep ai cung mo duoc.
      if (verdict?.kind === 'GRANTED') return GRANTED;
    }
    return DENIED;
  }

  /**
   * RUT: TAT CA phai dong y, va MOT tieng `LOCKED` thang tat ca.
   *
   * Thu tu uu tien do la co y: neu mot mien noi "khong ai rut duoc nua" con mot mien khac chi noi
   * "ban khong co quyen", thi cau tra loi dung cho nguoi dung la cau thu nhat — di xin quyen se
   * khong giup gi.
   */
  private async everyDomainAgrees(
    links: readonly FileLink[],
    action: FileAction,
    authUserId: string,
  ): Promise<FileAuthorizationOutcome> {
    let outcome: FileAuthorizationOutcome = GRANTED;
    for (const link of links) {
      const verdict = await this.ask(link, action, authUserId);
      if (verdict?.kind === 'LOCKED') return LOCKED;
      if (verdict?.kind !== 'GRANTED') outcome = DENIED;
    }
    return outcome;
  }

  /** `null` = khong mien nao nhan tra loi cho ten so huu do. Fail closed — `#287` P6. */
  private async ask(
    link: FileLink,
    action: FileAction,
    authUserId: string,
  ): Promise<FileDomainVerdict | null> {
    const authorizer = this.registry.authorizerFor(link.businessOwnerType);
    if (!authorizer) return null;
    return authorizer.authorize({ link, action, authUserId });
  }
}
