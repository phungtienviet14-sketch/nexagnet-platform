/**
 * CHAN "BOM GIAI NEN" TRUOC KHI GIAI NEN — khong phai sau.
 *
 * ===========================================================================
 * VI SAO MOT BIEN THEO BYTE CUA TEP LA KHONG DU
 *
 * `.xlsx` la OOXML nam trong mot tep ZIP. Mot bien tren so byte cua tep chi do phan DA NEN. DEFLATE
 * dat ty le ~1000:1 tren noi dung lap lai, nen mot tep 8 MB hop le ve cau truc co the bung ra hang
 * GB — va no bung ra TRUOC khi bat ky phep dem dong nao chay duoc, vi bo doc phai dung xong ca
 * sheet roi moi tra ve hang dau tien.
 *
 * Ket qua khong phai mot dong bi tu choi: la ca tien trinh API chet vi het bo nho, keo theo moi
 * khach dung chung tien trinh do.
 *
 * ===========================================================================
 * CACH DO MA KHONG PHAI GIAI NEN
 *
 * ZIP co mot BANG THU MUC TRUNG TAM o CUOI tep, va moi muc trong do KHAI san `uncompressedSize`.
 * Doc bang do la mot phep doc vai tram byte — khong giai nen mot bit nao. Cong cac kich thuoc khai
 * bao lai, va tu choi neu tong vuot tran.
 *
 * ===========================================================================
 * VA GIOI HAN CUA PHEP DO NAY — ghi ra day chu khong giau di
 *
 * Mot ke tan cong CO THE khai gian mot kich thuoc nho. Nhung khi do luong byte that giai ra se
 * khong khop voi phan khai bao, va bo giai nen bao loi — tuc tep bi tu choi o duong khac. Nen phep
 * do nay chan duoc dung cai no dinh chan: mot tep NEN THAT SU cao. No khong thay the mot bo giai
 * nen co tran; no la lop phong thu re nhat dat dung cho, truoc khi mot byte nao duoc bung ra.
 */

/** Chu ky `PK\u0005\u0006` cua ban ghi ket thuc bang thu muc trung tam. */
const EOCD_SIGNATURE = 0x0605_4b50;
/** Chu ky `PK\u0001\u0002` cua mot muc trong bang thu muc trung tam. */
const CENTRAL_FILE_SIGNATURE = 0x0201_4b50;
const EOCD_MIN_SIZE = 22;
/** ZIP cho phep mot chu thich toi 65.535 byte sau EOCD, nen phai do nguoc tu cuoi. */
const MAX_EOCD_SEARCH = 65_535 + EOCD_MIN_SIZE;

export interface ZipExpansionVerdict {
  /** Tong kich thuoc GIAI NEN do chinh tep khai bao. */
  readonly declaredBytes: number;
  readonly entries: number;
  /** `true` khi khong doc duoc bang thu muc — nguoi goi phai coi la khong tin duoc. */
  readonly unreadable: boolean;
}

/**
 * DOC TONG KICH THUOC GIAI NEN do tep khai bao, KHONG giai nen.
 *
 * Tra `unreadable: true` khi khong tim thay bang thu muc trung tam. Do KHONG phai "an toan": mot
 * tep khong co bang thu muc thi cung khong phai mot `.xlsx` hop le, va nguoi goi nen tu choi no.
 */
export function declaredZipExpansion(content: Buffer): ZipExpansionVerdict {
  const eocd = findEndOfCentralDirectory(content);
  if (eocd < 0) return { declaredBytes: 0, entries: 0, unreadable: true };

  const entryCount = content.readUInt16LE(eocd + 10);
  let offset = content.readUInt32LE(eocd + 16);

  let declaredBytes = 0;
  let entries = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > content.length) return { declaredBytes, entries, unreadable: true };
    if (content.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) {
      return { declaredBytes, entries, unreadable: true };
    }
    declaredBytes += content.readUInt32LE(offset + 24);
    entries += 1;

    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { declaredBytes, entries, unreadable: false };
}

function findEndOfCentralDirectory(content: Buffer): number {
  const from = Math.max(0, content.length - MAX_EOCD_SEARCH);
  for (let index = content.length - EOCD_MIN_SIZE; index >= from; index -= 1) {
    if (content.readUInt32LE(index) === EOCD_SIGNATURE) return index;
  }
  return -1;
}
