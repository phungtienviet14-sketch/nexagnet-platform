/**
 * DOC MOT TEP NGUOI DUNG CHON THANH base64 — mot dinh nghia cho ca hai duong nap.
 *
 * ================================================================================================
 * VI SAO TACH RA KHOI MAN HINH
 * ================================================================================================
 *
 * Nap bang ke cay xang (`StatementImport.tsx`) va nap bang ke phi duong bo (`TollImport.tsx`) deu
 * gui tep trong THAN JSON — hop dong cua may chu la `contentBase64`, khong phai `multipart`. Hai
 * ban sao cua cung mot doan doc tep se lech nhau o dung cho nguy hiem nhat: gioi han kich thuoc.
 * Mot ban quen kiem tran thi loi khong hien ra o day ma hien ra o mot `413` cua may chu, va nguoi
 * van hanh doc no thanh "he thong hong".
 *
 * Tran duoc kiem O PHIA NAY co chu dich: mot bang ke thang thuong chi vai chuc KB, nen cham tran
 * gan nhu luon la chon nham tep — va cau tra loi huu ich la noi ngay dieu do, khong phai gui tam
 * megabyte len mang roi bi tu choi.
 */

/** Tran cua may chu tinh bang KY TU base64, khong phai byte. */
export const MAX_UPLOAD_BASE64_LENGTH = 7_000_000;

export class UploadTooLargeError extends Error {
  constructor() {
    super('Tệp quá lớn so với giới hạn của máy chủ. Kiểm tra lại có đúng tệp không.');
    this.name = 'UploadTooLargeError';
  }
}

export const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp đã chọn.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Không đọc được tệp đã chọn.'));
        return;
      }
      // `data:<mime>;base64,<payload>` — chi lay phan payload.
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });

/** Doc tep VA kiem tran trong mot buoc — de khong noi goi nao quen buoc thu hai. */
export async function readUploadAsBase64(file: File): Promise<string> {
  const contentBase64 = await readFileAsBase64(file);
  if (contentBase64.length > MAX_UPLOAD_BASE64_LENGTH) throw new UploadTooLargeError();
  return contentBase64;
}
