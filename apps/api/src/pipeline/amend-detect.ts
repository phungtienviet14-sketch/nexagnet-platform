import { normalize } from '../rules/text.js';

/**
 * Khach dang doi SUA/HUY mot don da chot, chu khong dat mot don moi.
 *
 * VI SAO PHAI TAT DINH, KHONG DE LLM TU HIEU: hai ket cuc nay khac nhau ve HAU QUA, khong chi ve
 * cach tra loi. Doan nham "huy don cu 20 lay 5 cai thoi" thanh mot don moi se tao don thu hai
 * trong khi don 20 van song — Sale go ca hai vao KiotViet va khach nhan 25 cai ghe. Mot bo tu
 * khoa nho, doc duoc, chay truoc LLM la cai gia re de mua lay su chac chan o cho do.
 *
 * Bo tu khoa nay chi BAT DAU mot luot sua: no khong quyet dinh sua thanh cai gi. Viec do van la
 * cua agent (cong cu `sua_don`) tren ngu canh don vua chot.
 */

/** Huy han: khach noi thang la khong lay nua. */
const CANCEL =
  /(huy don|huy giup|huy ho|bo don|khong lay nua|ko lay nua|thoi khong lay|huy cai don)/;

/** Doi: khach giu y dinh mua nhung doi so luong / doi mon. */
const CHANGE =
  /(doi thanh|sua don|sua lai don|doi lai don|thay vi|doi so luong|bot xuong|tang len|lay .{0,12}(thoi|thoi nhe|thoi a)|chi lay|giam xuong|doi sang)/;

/** Nhac thang toi don TRUOC do — "don cu", "don luc nay", "don vua roi". */
const REFERS_TO_PREVIOUS = /(don cu|don truoc|don vua roi|don luc nay|don ban nay|don ho nay)/;

export interface AmendSignal {
  readonly isAmend: boolean;
  /** Khach muon BO han, khong thay bang gi. */
  readonly isCancelOnly: boolean;
}

export function detectAmend(text: string): AmendSignal {
  const norm = normalize(text);
  const cancel = CANCEL.test(norm);
  const change = CHANGE.test(norm) || REFERS_TO_PREVIOUS.test(norm);
  if (!cancel && !change) return { isAmend: false, isCancelOnly: false };
  // "huy don cu 20 lay 5 cai thoi" co CA hai dau hieu — do la mot lan DOI, khong phai mot lan bo.
  // Xet `change` trong cung mot cau truoc, neu khong moi cau doi don deu bi hieu thanh huy trang.
  return { isAmend: true, isCancelOnly: cancel && !change };
}
