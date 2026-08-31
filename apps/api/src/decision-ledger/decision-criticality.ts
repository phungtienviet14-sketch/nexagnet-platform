import type { DecisionCriticality } from './decision-ledger.types.js';

/**
 * CHINH SACH THAT BAI theo MUC NGHIEM TRONG — muc 11 hop dong nhiem vu.
 *
 * Cau hoi ma tep nay tra loi: "ghi so cai that bai thi nghiep vu di tiep hay dung lai?".
 *
 * ---------------------------------------------------------------------------
 * MOT CAU TRA LOI CHUNG CHO MOI QUYET DINH LA SAI, o CA HAI HUONG:
 *
 *   luon fail-open  -> mot quyet dinh phe duyet chi tien co the bien mat khong dau vet. Sau nay
 *                      khong ai chung minh duoc no da xay ra, va cung khong ai chung minh duoc
 *                      no chua xay ra. Do la mat mat im lang ma muc 11 cam.
 *   luon fail-closed -> Postgres nghen mot phut la moi duong doc nghiep vu do theo, ke ca nhung
 *                      duong chi ghi mot quan sat. Lop bao ve tro thanh nguon su co.
 *
 * Nen chinh sach gan vao MUC NGHIEM TRONG CUA CHINH QUYET DINH, do noi goi khai bao.
 *
 * ---------------------------------------------------------------------------
 * FAIL CLOSED CHI DUNG NEU BEN GOI O TRONG MOT GIAO DICH.
 *
 * Nem ra ngoai chi co gia tri khi loi do CUON NGUOC duoc thay doi nghiep vu. Neu don da gui cho
 * khach roi moi nem, thi ta vua co mot don da gui VA khong co ban ghi — te hon ca hai lua chon.
 * Do la ly do `DecisionLedgerRepository.runInTransaction()` ton tai va la ly do muc
 * `FINANCIAL_OR_AUTHORIZATION` phai duoc ghi TRONG cung giao dich voi thay doi nghiep vu.
 * `docs/kien-truc/business-decision-ledger.md` ghi lai rang buoc nay cho nguoi goi.
 */

/** Ba cach xu su khi kho tu choi. */
export type LedgerFailureMode =
  /** Nem tiep. Nghiep vu dung lai; giao dich bao quanh cuon nguoc. */
  | 'FAIL_CLOSED'
  /** Di tiep, nhung phat mot yeu cau DOI SOAT ben vung — khong duoc im lang. */
  | 'RECONCILE'
  /** Di tiep, chi de lai dau vet o telemetry. */
  | 'BEST_EFFORT';

/**
 * BANG CHINH SACH. Mot bang tra cuu tuong minh chu khong phai mot chuoi `if` rai rac: day la thu
 * nguoi doi soat doc de biet mat mot ban ghi co the xay ra o dau, va no phai doc duoc trong mot
 * man hinh.
 */
const POLICY: Readonly<Record<DecisionCriticality, LedgerFailureMode>> = {
  /**
   * Tien va tham quyen. Khong co ban ghi thi KHONG DUOC XAY RA.
   * Vi du: mot but toan quy, mot lan phe duyet vuot nguong, mot lan cho phep gui chung tu.
   */
  FINANCIAL_OR_AUTHORIZATION: 'FAIL_CLOSED',
  /**
   * Quyet dinh nghiep vu thuong. Mat ban ghi la thiet hai THAT nhung khong the doi lay viec dung
   * ca duong nghiep vu; bu lai bang mot yeu cau doi soat ma nguoi truc nhin thay.
   */
  BUSINESS_STANDARD: 'RECONCILE',
  /** Quan sat/goi y. Mot de xuat cua LLM khong duoc phep lam dung mot duong doc. */
  ADVISORY: 'BEST_EFFORT',
};

export function failureModeFor(criticality: DecisionCriticality): LedgerFailureMode {
  return POLICY[criticality];
}

/**
 * Mot yeu cau DOI SOAT: so cai le ra phai co mot hang o day, va no khong co.
 *
 * KHONG phai mot hang trong `WorkflowOutbox`. Ba le do: (a) outbox la duong giao viec cho workflow
 * engine, khong phai so ghi no cua so cai — muon no se lam ca hai khai niem mo di; (b) neu Postgres
 * la thu vua tu choi thi ghi them mot hang Postgres nua cung se tu choi; (c) mot yeu cau doi soat
 * can den duoc NGUOI TRUC ngay, khong phai mot hang cho mot worker nhat len.
 *
 * Nen cong nay la mot CONG TIEM VAO: mac dinh phat ra telemetry + log co cau truc (thu chac chan
 * roi khoi tien trinh duoc ke ca khi DB nghiep vu dang hong), va mot khach co rang buoc kiem toan
 * chat hon co the lap mot hien thuc khac ma khong sua tang nay.
 */
export interface DecisionReconciliationRequest {
  readonly tenantId: string;
  readonly decisionPoint: string;
  readonly reasonCode: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly idempotencyKey: string;
  readonly criticality: DecisionCriticality;
  readonly occurredAt: Date;
  readonly traceId?: string | undefined;
  readonly cause: string;
}

export abstract class DecisionReconciliationSink {
  abstract require(request: DecisionReconciliationRequest): void;
}
