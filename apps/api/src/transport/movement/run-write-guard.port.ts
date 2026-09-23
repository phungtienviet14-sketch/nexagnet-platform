import { Injectable } from '@nestjs/common';
import { MovementRepository, type RunWriteScope } from './movement.repository.js';

/**
 * Doc lai o day de nguoi dung CONG khong phai voi toi kho — mot capability tiem `RunWriteGuard` thi
 * chi can mot duong import, va duong do khong di qua `movement.repository.js`.
 */
export type { RunWriteScope, RunWriteTransaction } from './movement.repository.js';

/**
 * RANH GIOI SERIALIZE CUA MOT VONG CHAY — `#293` R2, phan con lai sau khi `#290` vao `main`.
 *
 * ============================================================================================
 * CAI GI DA DONG DUOC, VA CAI GI CON HO
 * ============================================================================================
 *
 * `closeRunAsSystemSerialized()` khoa hang vong chay, doc lai chang/ke hoach duoi khoa, phan xu
 * lai, roi chuyen trang thai va dat dau vet trong CUNG mot giao dich. `createLeg()` gianh CHINH
 * khoa do, nen mot nguoi lap ke hoach khong chen duoc mot chang moi vao giua.
 *
 * Cai con ho la nhung NGUOI GHI O NGOAI `transport-core`. Phep hoi lai (`recheckBlockers`) chay
 * duoi khoa, nhung cac bang ma no doc — phien cho, moc hien truong — khong he bi khoa do cham
 * toi. Nen thu tu nay VAN con:
 *
 *   1. lan dong khoa vong chay, hoi lai, khong thay gi chan;
 *   2. mot lai xe mo phien cho / ghi moc `LOADING` — khong cho mot khoa nao ca;
 *   3. lan dong ghi `COMPLETED` va commit.
 *
 * Ket qua la mot vong chay DA O DIEM CUOI nam canh mot dieu kien chan DANG MO. Khong mot ma chan
 * nao sai, khong mot phep kiem nao that bai — chi la hai nguoi ghi khong bao gio gap nhau.
 *
 * ============================================================================================
 * MOT CONG HEP, KHONG PHAI CA `MovementRepository`
 * ============================================================================================
 *
 * Cai ma `transport-checkpoint` can la DUNG MOT thu: duoc ghi duoi khoa cua vong chay. No khong
 * can quyen tao chang, doi trang thai vong chay, hay noi don vao chuyen — va `MovementRepository`
 * thi cho ca ba.
 *
 * Cung ly le da ghi o `VehicleOwnershipPort` va `CounterpartySubjectPort`: mot dich vu chi duoc
 * thay dung so phuong thuc no can. Tiem thang kho vao capability se mo mot duong ghi ma khong ai
 * kiem soat, va lan lech dau tien se khong ai biet no den tu dau.
 *
 * Ban than KHOA thi van chi co MOT ban hien thuc — `MovementRepository.underRunLock()`. Cong nay
 * khong tu viet lay mot cau `SELECT ... FOR UPDATE` nao: hai cau lenh khoa o hai cho la hai thu tu
 * khoa, va do la cong thuc cua deadlock chi lo ra duoi tai that.
 *
 * ============================================================================================
 * CHANG CUNG DI QUA KHOA NAY — `#354`
 * ============================================================================================
 *
 * Truoc `#354` lan doi trang thai chang (`MovementService.transitionLeg`/`cancelLeg`) ghi THANG,
 * khong khoa gi: mot moc doc thay chang con mo, van phong hoan tat chang, roi moc ghi vao mot chang
 * da ket thuc. Bay gio `MovementRepository.setLegStatus()` gianh CHINH khoa hang vong chay (va ghi
 * co dieu kien), con `RunWriteScope.legs` dua ra chang DOC LAI duoi khoa. Mot khoa, mot thu tu:
 * lan ghi moc va lan ket thuc chang khong bao gio nhin thay hai su that khac nhau.
 *
 * ============================================================================================
 * CONG NAY KHONG QUYET DINH GI
 * ============================================================================================
 *
 * No khong biet `WAITING_RUN_TERMINAL` hay `CHECKPOINT_RUN_TERMINAL` la gi, va no khong tu choi
 * mot lan ghi nao. No lam dung hai viec: giu khoa, va dua ra trang thai vong chay (cung cac chang
 * cua no) DOC LAI duoi khoa do. Ma tu choi thuoc ve capability so huu lan ghi — vi chinh capability do moi biet cau tu
 * choi hien len man hinh ai, bang chu gi, va duoi ma nao.
 */
export abstract class RunWriteGuard {
  /**
   * Chay `write` khi khoa hang vong chay DA trong tay va trang thai vong chay DA duoc doc lai.
   *
   * Nem tu trong `write` thi giao dich cuon lai va loi di thang ra ngoai — nguoi goi giu nguyen
   * cach bat loi cua minh.
   */
  abstract underRunLock<T>(runId: string, write: (scope: RunWriteScope) => Promise<T>): Promise<T>;
}

/**
 * Ban hien thuc DUY NHAT — chuyen tiep sang kho so huu khoa.
 *
 * Khong mot dong logic nao o day la co y: mot adapter co logic rieng se la mot luat thu hai ben
 * canh luat cua kho, va hai luat cho cung mot khoa thi som muon lech nhau.
 */
@Injectable()
export class MovementRunWriteGuard extends RunWriteGuard {
  constructor(private readonly runs: MovementRepository) {
    super();
  }

  async underRunLock<T>(runId: string, write: (scope: RunWriteScope) => Promise<T>): Promise<T> {
    return this.runs.underRunLock(runId, write);
  }
}
