import type { MatrixOutcome, MatrixRequest, RouteOutcome, RouteRequest } from './routing.types.js';

/**
 * CONG DINH TUYEN — `#277 M4`.
 *
 * ===========================================================================
 * HAI HAM, VA KHONG CO HAM THU BA.
 *
 * `#277 M4` co goi y mot ham thu ba (`matchTrace`, khop vet GPS len duong) *"optional only if
 * justified by current report needs"*. Hom nay khong co bao cao nao doi no: Lane N chua ton tai
 * tren `main`, va `M10` da noi ro posture — vet GPS THO la bang chung goc, vet khop duong la mot
 * PHEP CHIEU dan xuat. Khai truoc mot ham khong ai goi se de ra dung cai ma `YAGNI` canh bao:
 * mot hinh dang duoc chot khi chua biet cau hoi that.
 *
 * Khi Lane N can no, no la mot phuong thuc CONG THEM tren lop nay va mot adapter moi — khong mot
 * dong nghiep vu nao phai doi.
 *
 * ===========================================================================
 * VI SAO LA `abstract class` CHU KHONG PHAI `interface` + token.
 *
 * Cung khuon voi `ControlTowerCoreFacts`, `TransportProofCoreFacts` va moi cong khac cua mien van
 * tai: mot lop truu tuong LA mot token DI khi bien dich, nen `app-composition.ts` khong phai giu
 * mot hang so `Symbol` song song voi mot kieu — hai thu ma khong gi rang buoc chung voi nhau.
 */
export abstract class TransportRoutingPort {
  /**
   * DINH DANH nha cung cap dang duoc gan. Chi de GHI vao ket qua va nhat ky quyet dinh.
   *
   * KHONG duoc dung lam nhanh dieu kien o tang nghiep vu. Neu mot ngay co code viet
   * `if (routing.providerId === ...)` thi cong nay da that bai.
   */
  abstract readonly providerId: string;

  abstract route(request: RouteRequest): Promise<RouteOutcome>;

  /**
   * MA TRAN — duong ma tang de nghi thuc su dung.
   *
   * Co y KHONG duoc dinh nghia bang "goi `route()` N x M lan": `#277 M3` doi *"design must not
   * issue N x M wasteful calls when fleet grows"*, va moi nha cung cap that deu co mot diem cuoi
   * ma tran rieng re hon nhieu lan. Mot adapter KHONG co diem cuoi ma tran van duoc phep gap lai
   * thanh nhieu lan goi `route()` — nhung do la lua chon CUA ADAPTER, khong phai cua nghiep vu.
   */
  abstract matrix(request: MatrixRequest): Promise<MatrixOutcome>;
}
