import type { PartyStatus } from '../transport.types.js';

/**
 * LOAI CHU THE ma mot lien ket danh tinh tro toi.
 *
 * Hai gia tri, va do la co y — xem khoi ghi chu tren `TransportCounterpartySubjectKind` trong
 * `schema.prisma`. Cay xang khong nam o day cho toi khi co nguoi thuc su can.
 */
export const COUNTERPARTY_SUBJECT_KINDS = ['CUSTOMER', 'PARTNER'] as const;
export type CounterpartySubjectKind = (typeof COUNTERPARTY_SUBJECT_KINDS)[number];

/** PHAP NHAN trong doi that. Ba bang ben chi la cac MAT cua no. */
export interface Counterparty {
  readonly id: string;
  readonly name: string;
  readonly taxCode: string | null;
  readonly status: PartyStatus;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Mot hang chuyen mon thuoc ve mot phap nhan. `(kind, subjectId)` la khoa. */
export interface CounterpartyLink {
  readonly counterpartyId: string;
  readonly kind: CounterpartySubjectKind;
  readonly subjectId: string;
  readonly linkedBy: string;
  readonly createdAt: string;
}

/**
 * KHUNG NHIN doc: mot phap nhan kem moi mat cua no.
 *
 * Tra ve `links` da SAP XEP (`kind` roi `subjectId`) de hai lan doc cho ra cung mot chuoi — bai
 * test khang dinh duoc noi dung thay vi phai sap lai truoc moi phep so sanh.
 */
export interface CounterpartyIdentity {
  readonly counterparty: Counterparty;
  readonly links: readonly CounterpartyLink[];
}
