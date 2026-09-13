import { Injectable } from '@nestjs/common';
import { CompositeRunClosureBlockerSource } from '../planning/run-closure-blocker.source.js';
import { WaitingRunClosureBlockerSource } from '../waiting/waiting-run-closure-blocker.source.js';
import { CheckpointRunClosureBlockerSource } from './checkpoint-run-closure-blocker.source.js';

/**
 * HAI SU THAT CUA `transport-checkpoint`, DUOI MOT TOKEN — `#293` R4.
 *
 * ============================================================================================
 * VI SAO MOT LOP RIENG, KHONG PHAI MOT `useFactory`
 * ============================================================================================
 *
 * `planning.composition.spec.ts` doc `useClass.name` de khang dinh THU TU cua cac ban ghi cho
 * `RunClosureBlockerSource`. Mot `useFactory` khong co ten de doc, va bai kiem do — bai duy nhat
 * chan duoc viec ban mac dinh rong de len ban ghi de — se phai bi noi long de chay tiep.
 *
 * Mot lop co ten thi doc ra duoc thanh mot cau, va do la dieu bai kiem kia doi.
 *
 * ============================================================================================
 * HAI NGUON, MOT CAPABILITY
 * ============================================================================================
 *
 * Ca hai deu thuoc `transport-checkpoint` — moc hien truong (`#243` F1) va phien cho (`#279` O5)
 * bat/tat cung nhau. Nen chung phai den va di cung nhau; tach lam hai token se cho ra mot cau
 * hinh co mot nua su that, va khong ai goi ten duoc cau hinh do.
 *
 * Khach TAT `transport-checkpoint` thi ca hai bien mat va ban mac dinh rong cua `transport-core`
 * quay lai — tuc he thong khong hoi mot nguon khong ton tai, chu khong phai hoi roi nhan ve mot
 * cau tra loi gia.
 */
@Injectable()
export class TransportCheckpointRunClosureBlockerSource extends CompositeRunClosureBlockerSource {
  constructor(cargo: CheckpointRunClosureBlockerSource, waiting: WaitingRunClosureBlockerSource) {
    super([cargo, waiting]);
  }
}
