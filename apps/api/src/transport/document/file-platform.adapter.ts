import { Injectable } from '@nestjs/common';
import type { FileDecisionReason } from '../../files/file-decisions.js';
import { FileDomainError } from '../../files/file.errors.js';
import { FileService } from '../../files/file.service.js';
import {
  TransportDocumentFilePort,
  type DocumentFileBinding,
  type DocumentFileBindingDenialReason,
  type DocumentFileLookup,
} from './document-file.port.js';
import { TRANSPORT_OPERATIONAL_DOCUMENT_OWNER } from './operational-document-file.authorizer.js';

/**
 * CONG TEP CUA CHUNG TU, NOI VOI NEN TANG TEP THAT — `#287` P11.
 *
 * ============================================================================================
 * DAY LA "DONG DUY NHAT PHAI DOI" MA LANE O DA VIET SAN
 * ============================================================================================
 *
 * `transport-document.module.ts` (`#279`) noi ro: khi `#287` duoc chap nhan tren `main`, thu duy
 * nhat phai doi la mot dong dang ky provider — khong mot luat mien nao, khong mot bang nao, khong
 * mot bai test nghiep vu nao. Lop nay la thu thay vao cho `NoFilePlatformAdapter`.
 *
 * Taxonomy chung tu (`DELIVERY_RECEIPT`/`GATE_PASS`/`LOADING_SLIP`/`WEIGH_TICKET`/`OTHER`) O LAI
 * BEN LANE O va khong xuat hien o day: nen tang tep chi biet mot `businessOwnerType` va mot
 * `businessOwnerId`. `#287` P11.
 *
 * ============================================================================================
 * KHONG MOT DINH VI NAO DI QUA DAY
 * ============================================================================================
 *
 * `FileService.describeFor()` tra ve `FileRecord`, tuc CO `storageKey`. Lop nay doc dung bon truong
 * — `id`, `state`, `declaredMimeType`, `byteSize` — va vut phan con lai. Do la cho ranh gioi duoc
 * giu, va `document-file-binding.spec.ts` khoa no bang mot bai doc chinh ma nguon.
 */
@Injectable()
export class FilePlatformDocumentAdapter extends TransportDocumentFilePort {
  constructor(private readonly files: FileService) {
    super();
  }

  /**
   * HOI NEN TANG TEP. KHONG BAO GIO tra `UNAVAILABLE`: nen tang CO mat o ban nay, nen mot cau tra
   * loi "chua co nen tang tep" tu day se la mot loi noi doi day nguoi dung sang duong chung tu giay.
   *
   * Hai ma tu choi cua Lane O anh xa 1-1 voi hai ma cua nen tang. Khong mot ma thu ba nao duoc
   * doan: mot loi ha tang (CSDL mat ket noi) PHAI di tiep ra ngoai thay vi hoa trang thanh "ma tep
   * khong dung duoc" — tron chung se lam mot su co ha tang trong nhu mot loi nguoi dung.
   */
  async describe(fileId: string, authUserId: string): Promise<DocumentFileLookup> {
    try {
      const file = await this.files.describeFor(fileId, authUserId);
      return {
        kind: 'AVAILABLE',
        file: {
          fileId: file.id,
          state: 'ACTIVE',
          contentType: file.declaredMimeType,
          byteSize: file.byteSize,
        },
      };
    } catch (error) {
      if (!(error instanceof FileDomainError)) throw error;
      if (error.reason === 'FILE_NOT_ACTIVE') {
        return { kind: 'DENIED', reason: 'FILE_NOT_ACTIVE' };
      }
      if (error.reason === 'FILE_NOT_AVAILABLE_TO_CALLER') {
        return { kind: 'DENIED', reason: 'FILE_NOT_AVAILABLE_TO_CALLER' };
      }
      throw error;
    }
  }

  /**
   * BAO DAM tep da gan vao chung tu — `#287` P2/P11.
   *
   * `purpose` cua lien ket la `OPERATIONAL_DOCUMENT` — MOT gia tri cho moi loai chung tu, khong
   * nam gia tri theo `OperationalDocumentType`. Nen tang khong duoc biet taxonomy do (`#287` P11),
   * va no cung khong can: cau hoi nen tang phai tra loi la "ai duoc xem tep nay", va cau tra loi do
   * den tu CHUNG TU, khong tu loai cua chung tu.
   *
   * ============================================================================================
   * HOI TRUOC, GHI SAU — va thu tu do la ca phep sua
   * ============================================================================================
   *
   * `linkStateOf()` chay TRUOC `link()` vi ham nay duoc goi tren CA duong gui lai, tuc phan lon
   * cac lan goi la "da gan roi, khong co gi de lam". Hoi truoc lam ba tinh huong sau tra ve DUNG
   * thay vi tra ve mot lan tu choi sai — xem khoi chu thich cua `FileService.linkStateOf()`:
   * tep bi rut sau do, chung tu bia mo sau do, hoac mot nguoi khac gui lai dung lenh cu.
   *
   * Va no tach `RELEASED` khoi `NONE`: chi `NONE` moi la lo hong phai va. Mot lien ket DA BI RUT
   * khong duoc gan lai o day — lam vay la lam lai dung cai ma van hanh vua co y go bo.
   *
   * ============================================================================================
   * KHONG NUOT NUA — DAT NHAN
   * ============================================================================================
   *
   * Ban dau lop nay bat MOI `FileDomainError` roi tra `void`, nen mot lan gan hong trong het nhu
   * mot lan gan duoc. Ket qua la mot trang thai VINH VIEN khong ai sua duoc: `fileId` co tren hang
   * chung tu, lien ket thi khong, va ke toan mo khong ra to bang chung ho dang doi soat.
   *
   * Nay moi duong tu choi mang mot NHAN rieng, va ben goi quyet. Van KHONG NEM: hang chung tu da
   * ghi xong roi, va mot lan gan hong khong duoc lam hong ca lan ghi do.
   *
   * Loi HA TANG cung khong nem, nhung no ra `PENDING` chu khong `DENIED` — mot su co CSDL khong
   * duoc hoa trang thanh mot lan mien tu choi, vi hai thu do doi hai viec khac han o phia nguoi
   * van hanh. Do cung la ly le ma `describe()` dung khi no nem tiep loi ha tang ra ngoai.
   *
   * Khong ghi them mot dong telemetry nao o day: `FileService.link()` DA ghi ly do that su, va
   * `OperationalDocumentService` ghi ket qua cuoi — ghi lan ba se dat ba dong cho mot su kien
   * trong cung mot trace.
   */
  async bind(fileId: string, documentId: string, authUserId: string): Promise<DocumentFileBinding> {
    const coordinates = {
      fileId,
      businessOwnerType: TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
      businessOwnerId: documentId,
      purpose: 'OPERATIONAL_DOCUMENT',
    } as const;

    try {
      const presence = await this.files.linkStateOf(coordinates);
      if (presence === 'ACTIVE') return { kind: 'BOUND', created: false };
      if (presence === 'RELEASED') return { kind: 'RELEASED' };

      await this.files.link({ ...coordinates, authUserId });
      return { kind: 'BOUND', created: true };
    } catch (error) {
      if (!(error instanceof FileDomainError)) {
        return { kind: 'PENDING', reason: 'FILE_BINDING_PLATFORM_FAULT' };
      }
      // `CONFLICT` la lan va cham cua hai lenh chay song song (`FILE_LINK_ALREADY_ACTIVE`). Lan
      // gui lai sau doc ra chinh lien ket that, nen day la `PENDING` chu khong `DENIED`.
      if (error.kind === 'CONFLICT') return { kind: 'PENDING', reason: 'FILE_BINDING_RACED' };
      return { kind: 'DENIED', reason: bindingDenialFor(error.reason) };
    }
  }
}

/**
 * MA cua nen tang -> MA cua cong. Mot anh xa TUONG MINH, khong mot `default` gop tat ca.
 *
 * `FILE_LINK_OWNER_UNKNOWN` la mot loi DANG KY cua chinh he thong — khong mien nao nhan tra loi
 * quyen cho `TRANSPORT_OPERATIONAL_DOCUMENT`. Gop no vao `FILE_NOT_AVAILABLE_TO_CALLER` se lam mot
 * su co cau hinh trong y het mot ma tep nguoi dung go bua, va nguoi truc se di tim nham cho.
 */
function bindingDenialFor(reason: FileDecisionReason): DocumentFileBindingDenialReason {
  switch (reason) {
    case 'FILE_NOT_ACTIVE':
      return 'FILE_NOT_ACTIVE';
    case 'FILE_LINK_OWNER_UNKNOWN':
      return 'FILE_BINDING_OWNER_UNKNOWN';
    case 'FILE_LINK_DENIED_BY_DOMAIN':
      return 'FILE_BINDING_REFUSED_BY_DOMAIN';
    default:
      // Gom ca `FILE_NOT_AVAILABLE_TO_CALLER`: "khong co" va "khong phai cua ban" o lai MOT ma,
      // dung nhu `#287` P6 doi — tach chung se bien duong nay thanh mot may do su ton tai.
      return 'FILE_NOT_AVAILABLE_TO_CALLER';
  }
}
