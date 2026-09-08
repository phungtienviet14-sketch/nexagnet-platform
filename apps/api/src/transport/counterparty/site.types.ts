import type { PartyStatus } from '../transport.types.js';

/**
 * MOT CHO LAM VIEC VAT LY cua mot phap nhan — `#267` H1.
 *
 * PHAN BIET voi `Counterparty`, va do la ca ly do bang nay ton tai: mot phap nhan la mot chu the
 * PHAP LY (co ma so thue, co cong no, xuat duoc hoa don); mot dia diem la mot CHO tren mat dat
 * (co dia chi, co cong, xe dung duoc o do). Mot cong ty ba kho la MOT phap nhan va BA dia diem.
 *
 * KHONG MOT TRUONG TIEN NAO, va se khong co: `#267` H1 viet *"no money semantics"*. Cau hoi ma
 * kieu nay tra loi la "xe dang dung o dau", khong phai "hoa don xuat cho ai".
 */
export interface CounterpartySite {
  readonly id: string;
  readonly counterpartyId: string;
  /** Ten cho ma lai xe doc duoc: "Kho Hai Phong", "Nha may Que Vo 2". */
  readonly name: string;
  /** NULL nghia la CHUA NHAP, khong phai "khong co dia chi". */
  readonly address: string | null;
  readonly status: PartyStatus;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * DIA DIEM kem TEN PHAP NHAN so huu no — khung nhin ma man hinh lai xe can.
 *
 * `#267` H6 in ra HAI dong: ten cong ty, roi ten kho. Neu tang doc chi tra ve `CounterpartySite`
 * thi tang tren phai tu di hoi ten phap nhan cho tung dong, va o mot danh sach ung vien do la N
 * lan doc them cho mot cau hoi da tra loi duoc mot lan.
 */
export interface CounterpartySiteView {
  readonly site: CounterpartySite;
  readonly counterpartyId: string;
  readonly counterpartyName: string;
}
