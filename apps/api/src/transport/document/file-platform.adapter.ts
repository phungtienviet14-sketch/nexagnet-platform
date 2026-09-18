import { Injectable } from '@nestjs/common';
import { FileDomainError } from '../../files/file.errors.js';
import { FileService } from '../../files/file.service.js';
import { TransportDocumentFilePort, type DocumentFileLookup } from './document-file.port.js';
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
   * GAN tep vao chung tu vua ghi.
   *
   * `purpose` cua lien ket la `OPERATIONAL_DOCUMENT` — MOT gia tri cho moi loai chung tu, khong
   * nam gia tri theo `OperationalDocumentType`. Nen tang khong duoc biet taxonomy do (`#287` P11),
   * va no cung khong can: cau hoi nen tang phai tra loi la "ai duoc xem tep nay", va cau tra loi do
   * den tu CHUNG TU, khong tu loai cua chung tu.
   *
   * NUOT mot lan tu choi cua mien — xem hop dong o `TransportDocumentFilePort.bind()`. Khong ghi
   * them mot dong telemetry nao o day: `FileService.link()` DA ghi ly do that su, va ghi lai lan
   * hai se dat hai dong cho mot su kien trong cung mot trace.
   */
  async bind(fileId: string, documentId: string, authUserId: string): Promise<void> {
    try {
      await this.files.link({
        fileId,
        businessOwnerType: TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
        businessOwnerId: documentId,
        purpose: 'OPERATIONAL_DOCUMENT',
        authUserId,
      });
    } catch (error) {
      if (!(error instanceof FileDomainError)) throw error;
    }
  }
}
