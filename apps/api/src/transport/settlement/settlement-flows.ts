/**
 * NAM DONG TIEN — bat bien trung tam cua `TX-05`, viet thanh KIEU chu khong thanh quy uoc.
 *
 * ===========================================================================
 * Issue #87 doi dung mot dieu: *"Do not merge ledgers just because the same Party plays multiple
 * roles."* Nguon (VT-054) noi ro hon: mot doi tac vua cho thue xe vua mang don ve, va hai chieu
 * cong no cua ho "phai tach ro rang, khong gop chung".
 *
 * Cho de hong khong phai luc GHI — luc ghi thi ai cung biet minh dang ghi cai gi. Cho de hong la
 * luc DOC: mot phep cong "tong cong no cua doi tac X" quen loc `flow` se lang le cong tien thue xe
 * voi tien hoa hong, va cho ra mot con so khong ai no ai ca. Vi vay tep nay khong chi khai bao bon
 * hang so; no khai bao mot BANG TRA bat buoc, va moi duong ghi phai di qua no.
 *
 * DONG THU HAI (cong ty <> quy lai xe) CO Y VANG MAT khoi `SETTLEMENT_FLOWS`. `TX-03` da giu no
 * bang `DriverFundAccount` + `DriverFundEntry`, va do la MOT so cai. Dung len mot bang cong no lai
 * xe thu hai o day se tao hai con so cho cung mot quan he tien — va ke tu do khong ai doi soat
 * duoc ben nao dung. T5 DOC so quy cua T3 luc bao cao, khong ghi vao no.
 */

/** Chieu cua mot nghia vu tien. `GD-15` cam bu tru hai chieu — xem `settlement-reporting`. */
export const SETTLEMENT_DIRECTIONS = ['RECEIVABLE', 'PAYABLE'] as const;
export type SettlementDirection = (typeof SETTLEMENT_DIRECTIONS)[number];

/**
 * BON dong tien co chung tu o `TX-05`. Dong thu nam trong T1 (quy lai xe) thuoc `TX-03`.
 *
 * Ten dong noi QUAN HE, khong noi loai chung tu: `CARRIER_SERVICE` la "tien tra nha xe da chay ho",
 * khong phai "hoa don nha xe". Mot ngay nao do mot quan he sinh ra hai loai chung tu, va luc do
 * `kind` la cho de phan biet, khong phai `flow`.
 */
export const SETTLEMENT_FLOWS = [
  'CUSTOMER_FREIGHT',
  'FUEL_SUPPLIER',
  'CARRIER_SERVICE',
  'PARTNER_COMMISSION',
] as const;
export type SettlementFlow = (typeof SETTLEMENT_FLOWS)[number];

export const SETTLEMENT_COUNTERPARTY_KINDS = ['CUSTOMER', 'PARTNER', 'FUEL_SUPPLIER'] as const;
export type SettlementCounterpartyKind = (typeof SETTLEMENT_COUNTERPARTY_KINDS)[number];

/**
 * HINH DANG BAT BUOC cua mot dong — chieu nao, doi tac loai gi.
 *
 * Day la thu bien "nam dong giu rieng" tu mot cau trong tai lieu thanh mot dieu kien kiem duoc.
 * Mot chung tu `PARTNER_COMMISSION` mang `direction: RECEIVABLE` bi tu choi ngay o cong ghi, chu
 * khong nam trong bang cho toi luc ai do doc bao cao.
 */
interface FlowShape {
  readonly direction: SettlementDirection;
  readonly counterpartyKind: SettlementCounterpartyKind;
  /** Cau mo ta dung cho thong bao tu choi — nguoi nhan phai sua duoc mot cai gi do. */
  readonly label: string;
}

export const SETTLEMENT_FLOW_SHAPES: Readonly<Record<SettlementFlow, FlowShape>> = {
  CUSTOMER_FREIGHT: {
    direction: 'RECEIVABLE',
    counterpartyKind: 'CUSTOMER',
    label: 'Khách hàng nợ cước vận chuyển',
  },
  FUEL_SUPPLIER: {
    direction: 'PAYABLE',
    counterpartyKind: 'FUEL_SUPPLIER',
    label: 'Công ty nợ cây xăng theo kỳ đối soát bảng kê',
  },
  CARRIER_SERVICE: {
    direction: 'PAYABLE',
    counterpartyKind: 'PARTNER',
    label: 'Công ty nợ nhà xe ngoài đã chạy hộ',
  },
  PARTNER_COMMISSION: {
    direction: 'PAYABLE',
    counterpartyKind: 'PARTNER',
    label: 'Công ty nợ hoa hồng đối tác mang đơn',
  },
};

/** Chieu BAT BUOC cua mot dong. Khong co duong nao khai chieu khac cho cung mot dong. */
export const directionForFlow = (flow: SettlementFlow): SettlementDirection =>
  SETTLEMENT_FLOW_SHAPES[flow].direction;

export const counterpartyKindForFlow = (flow: SettlementFlow): SettlementCounterpartyKind =>
  SETTLEMENT_FLOW_SHAPES[flow].counterpartyKind;

/**
 * HAI DONG CUA CUNG MOT DOI TAC co phai la MOT so cai khong.
 *
 * Tra loi `false` cho cap `CARRIER_SERVICE` / `PARTNER_COMMISSION` ngay ca khi `counterpartyId`
 * trung nhau — do chinh la truong hop VT-054 mo ta, va la thu Issue #87 acceptance 9 doi chung
 * minh. Ham nay ton tai de cau hoi do co MOT cau tra loi trong ca ma nguon, thay vi moi cho doc
 * lai dieu kien roi mot cho quen mot ve.
 */
export const isSameLedger = (
  left: { readonly flow: SettlementFlow; readonly counterpartyId: string },
  right: { readonly flow: SettlementFlow; readonly counterpartyId: string },
): boolean => left.flow === right.flow && left.counterpartyId === right.counterpartyId;

/**
 * KHOA SO CAI — chuoi dinh danh MOT so cai rieng biet.
 *
 * Dung lam khoa gom nhom o tang bao cao. Gom bang `counterpartyId` khong thoi CHINH LA phep bu tru
 * ma `GD-15` cam; gom bang `flow` khong thoi se tron hai khach hang lam mot.
 */
export const ledgerKey = (flow: SettlementFlow, counterpartyId: string): string =>
  `${flow}:${counterpartyId}`;
