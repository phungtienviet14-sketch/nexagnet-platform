/**
 * HAU KIEM TIEN: moi con so tien trong cau tra loi phai la con so mot CONG CU da tra ve trong
 * chinh luot do.
 *
 * Vi sao can, du prompt da cam: prompt la mot loi de nghi, khong phai mot rang buoc. Mot con gia
 * sai gui vao nhom 200 dai ly la mot cam ket sai voi khach that — chi phi cua no khong doi xung
 * voi chi phi cua viec bo mot ban soan va lui ve van ban tra bang.
 *
 * ---------------------------------------------------------------------------------------------
 * NGUYEN TAC SO KHOP: QUY VE DUNG MOT GIA TRI VND, ROI SO GIA TRI VOI GIA TRI.
 *
 * Ban truoc so khop bang CHUOI CHU SO va con them ca "bien the rut gon": mot ket qua 1.150.000
 * cho phep luon ca chuoi "1150", vi nguoi Viet viet 1.150.000 thanh "1.150k". Nhung "1150" cung
 * chinh la cach viet cua MOT NGHIN MOT TRAM NAM MUOI DONG — nen "1150đ" di lot. Review doc lap
 * goi ten do la B2 o lop tham quyen; day la CUNG MOT LOI o lop hau kiem, nen no duoc sua cung
 * mot luc va bang cung mot bo ham.
 *
 * `1.150.000đ`, `1.150k`, `1,15tr` van deu qua — chung la ba cach viet cua CUNG mot gia tri. Cai
 * bi chan la mot GIA TRI khac, khong phai mot cach viet khac.
 */
import { monetaryLiterals, numeralLiterals } from '../outbound/outbound-claims.js';

/** Con so tien LLM viet ra ma khong cong cu nao tra ve. Rong = sach. */
export function unverifiedAmounts(text: string, toolOutputs: readonly unknown[]): string[] {
  const allowed = allowedAmounts(toolOutputs);
  const found = new Set<string>();
  for (const literal of monetaryLiterals(text)) {
    // `value === null` = cach viet khong quy duoc ve mot gia tri duy nhat. Bao cao no thay vi bo
    // qua: mot con so khong doc duoc chac chan cung khong doi chieu duoc.
    if (literal.value === null || !allowed.has(literal.value)) found.add(literal.written);
  }
  return [...found];
}

/** Moi gia tri doc duoc tu ket qua cong cu cua chinh luot nay. */
function allowedAmounts(toolOutputs: readonly unknown[]): Set<number> {
  const serialized = toolOutputs.map((output) => JSON.stringify(output ?? null)).join(' ');
  const allowed = new Set<number>();
  for (const literal of numeralLiterals(serialized)) {
    if (literal.value !== null) allowed.add(literal.value);
  }
  return allowed;
}
