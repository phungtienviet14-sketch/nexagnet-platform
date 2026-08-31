import { createHash } from 'node:crypto';

/**
 * CHONG TRUNG cua so cai — muc 10 hop dong nhiem vu.
 *
 * BA NGUON SINH BAN GHI TRUNG, deu co that trong he nay:
 *   1. Hatchet chay lai mot buoc da chay (`maxAttempts` > 1 tren MOI khuon);
 *   2. HTTP thu lai — client bam hai lan, proxy gui lai, hoac `SEND_FAILED` roi nguoi bam lai;
 *   3. giao hang at-least-once tu outbox sang engine.
 *
 * ---------------------------------------------------------------------------
 * KHOA LA BAT BUOC, KHONG CO MAC DINH. Day la quyet dinh thiet ke quan trong nhat cua tep nay.
 *
 * Mot mac dinh "tu bam tu noi dung quyet dinh" nghe tien loi va SAI: hai lan cung mot cong, cung
 * mot ca, cung mot ma ly do — o hai thoi diem khac nhau — la HAI quyet dinh that. Mot don bi tu
 * choi luc 9h va bi tu choi lai luc 15h sau khi Sale sua du lieu la hai su kien nghiep vu; gop
 * chung thanh mot hang se xoa mat lan thu hai, va nguoi doi soat se ket luan he thong "chi tu
 * choi mot lan".
 *
 * Nguoc lai, mot mac dinh "moi lan mot UUID moi" cung SAI: luc do chay lai sinh hang trung, va
 * dung cai ma muc 10 cam.
 *
 * Khong co cau tra loi dung o TANG NEN. Chi NOI GOI biet lan ghi nay la "cung mot lan" hay "mot
 * lan khac" — vi chi no biet mot luot, mot lan thuc thi, mot cu bam nut la gi. Nen kieu bat noi
 * goi phai noi ra, va `decisionIdempotencyKey()` cho no ba cach noi.
 *
 * ---------------------------------------------------------------------------
 * DAU TAY (`fingerprint`) la nua thu hai, va no chan mot loi khac han.
 *
 * Khoa tra loi "day co phai lan ghi cu khong". Dau tay tra loi "neu dung, thi noi dung co giong
 * khong". Cung khoa + khac noi dung = LOI CUA BEN GOI (mot khoa bi dung lai cho mot quyet dinh
 * khac), va tra ve hang cu luc do se lam ben goi tin rang quyet dinh MOI cua no da duoc ghi —
 * mot ban ghi nghiep vu bien mat trong im lang. Duong dung la nem.
 */

/**
 * Ba cach mot noi goi noi "lan ghi nay la lan nao".
 *
 * KHONG co bien the "de he thong tu quyet" — xem chu thich tren.
 */
export type DecisionOccurrence =
  /**
   * Khoa do ben ngoai cap (idempotency key cua HTTP client, id su kien cua he gui).
   * Manh nhat: ben goi da co mot danh tinh that cho lan thao tac nay.
   */
  | { readonly kind: 'externalKey'; readonly key: string }
  /**
   * MOT LAN THUC THI cua workflow. `attempt` CO Y khong nam trong khoa: hai lan thu cua CUNG mot
   * run la CUNG mot quyet dinh nghiep vu, va do chinh la truong hop chong trung phai bat.
   */
  | { readonly kind: 'workflowRun'; readonly workflowRunId: string }
  /**
   * MOT LUOT nghiep vu (mot tin, mot request, mot cu bam nut) — dung `traceId`.
   * Mot cong chi duoc ra MOT quyet dinh trong mot luot; luot sau la mot quyet dinh khac.
   */
  | { readonly kind: 'turn'; readonly traceId: string };

/** Neo dinh danh cua mot quyet dinh, dung cho ca khoa lan dau tay. */
export interface DecisionIdentity {
  readonly decisionPoint: string;
  readonly subjectType: string;
  readonly subjectId: string;
}

/**
 * Dung khoa chong trung TAT DINH tu (danh tinh quyet dinh + lan xuat hien).
 *
 * `decisionPoint` nam trong khoa: mot luot chay qua nam cong khac nhau va nam quyet dinh do phai
 * la nam hang. Thieu no thi cong thu hai trong cung mot luot se bi coi la lan chay lai cua cong
 * thu nhat — mot mat mat im lang.
 */
export function decisionIdempotencyKey(
  identity: DecisionIdentity,
  occurrence: DecisionOccurrence,
): string {
  const scope =
    occurrence.kind === 'externalKey'
      ? `ext:${occurrence.key}`
      : occurrence.kind === 'workflowRun'
        ? `run:${occurrence.workflowRunId}`
        : `turn:${occurrence.traceId}`;
  return digest([identity.decisionPoint, identity.subjectType, identity.subjectId, scope]);
}

/**
 * Dau tay NOI DUNG cua mot quyet dinh.
 *
 * CHI gom nhung truong ma mot lan chay lai TRUNG THUC bat buoc phai lap lai y het. CO Y bo ra:
 *   · `occurredAt`   — dong ho cua hai lan chay khac nhau la binh thuong;
 *   · `traceId`/`spanId` — mot lan chay lai la mot trace MOI, va do la dung;
 *   · `releaseSha`   — mot lan chay lai sau khi trien khai ban moi van la cung quyet dinh do;
 *   · `detail`       — bang chung bo sung co the giau len giua hai lan, khong lam quyet dinh khac di.
 * Giu chung lai se bien moi lan chay lai binh thuong thanh mot `LEDGER_IDEMPOTENCY_KEY_CONFLICT`,
 * tuc bien lop bao ve thanh nguon su co.
 */
export function decisionFingerprint(input: {
  readonly decisionPoint: string;
  readonly outcome: string;
  readonly reasonCode: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly actorKind: string;
  readonly criticality: string;
}): string {
  return digest([
    input.decisionPoint,
    input.outcome,
    input.reasonCode,
    input.subjectType,
    input.subjectId,
    input.actorKind,
    input.criticality,
  ]);
}

/**
 * Bam mot danh sach doan. Dung `\u0000` lam dau phan cach: no khong xuat hien trong mot ma quyet
 * dinh, mot dinh danh hay mot `traceId` nao, nen hai bo doan khac nhau khong the ra cung mot chuoi
 * dau vao. Mot dau phan cach nhu `:` thi co the.
 */
function digest(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}
