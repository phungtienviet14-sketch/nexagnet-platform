/**
 * CHINH SACH DIEU XE — nguong va THU TU XEP HANG, khong phai luat.
 *
 * Moi so o day deu co mac dinh dung duoc, nen khoi cau hinh nay HOAN TOAN TUY CHON trong goi
 * khach — cung mot le voi `TRANSPORT_PROOF_POLICY` va sau capability van tai truoc no: khai
 * `policy` trong `CAPABILITY_REQUIREMENTS` se bien mot khoi tuy chon thanh mot DIEU KIEN BOOT, va
 * moi khach van tai se phai go mot khoi rong chi de he thong khoi chet.
 */
export const TRANSPORT_DISPATCH_POLICY = Symbol('TRANSPORT_DISPATCH_POLICY');

/**
 * DONG HO — mot token rieng, va no ton tai vi mot ly do rat cu the cua Nest.
 *
 * Moi tang tat dinh cua Lane M deu nhan `now` bang tham so (`INV-25`), nhung tang dich vu thi phai
 * lay no tu dau do. Mot tham so `now: () => Date = () => new Date()` TRONG lam viec do, cho toi
 * luc khoi dong: Nest giai tham so theo KIEU, kieu cua mot ham la `Function`, va khong provider
 * nao mang ten do. Mot token co `@Optional()` giai duoc bai toan ma khong danh doi tinh kiem thu.
 */
export const DISPATCH_CLOCK = Symbol('DISPATCH_CLOCK');
export type DispatchClock = () => Date;

/**
 * KHOA XEP HANG — `#277 M7`, va la cau tra loi cho loi cam o `M6`:
 * *"Do not create one opaque magic score whose meaning cannot be inspected."*
 *
 * Xep hang o day KHONG phai mot tong co trong so. No la mot danh sach KHOA CO TEN duoc ap theo
 * dung thu tu, va ca danh sach di ra DTO. Nguoi doc bang de nghi doc duoc chinh xac cai gi da
 * quyet dinh thu tu, khong phai doan mot con so 0,73 nghia la gi.
 */
export const DISPATCH_ORDERING_KEYS = [
  /**
   * KIP GIO LAY HANG di truoc KHONG KIP. `M7` buoc 2.
   *
   * BO QUA HOAN TOAN khi don khong co han lay hang — `M7`: *"If Order does not yet contain a
   * pickup deadline, skip that factor rather than inventing one."* `TransportOrder` hom nay THAT
   * SU khong co cot nao mang han lay hang, nen duong "bo qua" la duong mac dinh chu khong phai
   * mot nhanh hiem.
   */
  'DEADLINE_FEASIBILITY',
  /**
   * KHONG CAT NGANG VIEC DANG LAM di truoc CAT NGANG.
   *
   * KHOA NAY LA MOT BO SUNG cua Lane M so voi danh sach goi y cua `M7`, va no phai duoc noi ra.
   * `M6` doi danh gia HAI diem xuat phat cho moi xe: cho dang dung, va cho se ranh. Voi mot chiec
   * xe dang cho hang, "cho dang dung" chi den duoc bang cach BO DO chuyen dang chay — mot de nghi
   * gan nhu luon sai ma hinh hoc thuan tuy khong nhin thay.
   *
   * Nen no la mot khoa RIENG, dat sau tinh kha thi ve gio va truoc moi phep do khoang cach: mot
   * chiec xe dang cho hang cua khach khac co the DUNG canh diem lay hang, va no van khong duoc
   * xep tren mot chiec xe ranh o xa hon.
   */
  'NO_WORK_INTERRUPTION',
  /** KM CHAY RONG THEM VAO it hon thang. `M7` buoc 3, va la muc tieu chinh cua #274 §4. */
  'EMPTY_ROAD_DISTANCE',
  /** DEN SOM HON thang. `M7` buoc 4. */
  'PICKUP_ETA',
  /**
   * PHAN DINH HOA on dinh: bien so, roi den ma xe. `M7` buoc 5.
   *
   * Bien so truoc vi no la thu NGUOI doc thay; ma xe la luoi an toan cho hai dong trung bien so
   * (khong xay ra — `registrationPlate` la `@unique`) va cho du lieu mau khong co bien so.
   */
  'STABLE_IDENTITY',
] as const;
export type DispatchOrderingKey = (typeof DISPATCH_ORDERING_KEYS)[number];

export interface TransportDispatchPolicy {
  /**
   * BAN DINH VI CU HON MUC NAY thi khong con la "xe dang o day", giay.
   *
   * 1800 giay (30 phut) khong den tu mot chuan nao — no den tu chinh sach lay mau da do va ghi o
   * `docs/kien-truc/transport-geospatial.md` §5: khi mot chuyen DANG chay, he phat mot diem it
   * nhat moi 900 giay ngay ca luc xe dung yen. Nen 1800 giay la HAI chu ky im lang lien tiep —
   * du de khong bao dong vi mot lan mat song, va du chat de khong dieu mot chiec xe theo mot vi
   * tri tu buoi sang.
   */
  readonly currentLocationFreshSeconds: number;
  /**
   * QUA MUC NAY thi ban dinh vi KHONG dung lam diem xuat phat duoc nua, giay.
   *
   * Giua hai nguong la vung `AGEING`: van dung, nhung DTO noi ro tuoi cua no. `#277 M1` doi
   * *"stale/unusable location must be visible as such"* — hai nguong cho ba trang thai la cach re
   * nhat de mot man hinh noi duoc su khac biet do.
   *
   * 4 gio: dai hon mot chang duong truong khong song (Ha Noi - Hai Phong ~2 gio), ngan hon mot
   * ca lam viec.
   */
  readonly currentLocationUsableSeconds: number;
  /**
   * CHAN TREN so ung vien duoc dua sang nha cung cap dinh tuyen.
   *
   * Day la cho DUY NHAT khoang cach duong chim bay duoc phep xuat hien trong ca tang nay: loc so
   * bo, roi bien mat. `#277 M3`: *"straight-line distance may prefilter only; it must not be the
   * final ranking metric."*
   *
   * 12 o quy mo doi xe hien tai (khoang 10 xe) nghia la thuc te khong loc gi — dung nhu mong
   * muon. No ton tai de khi doi xe len 100 chiec, mot lan mo bang khong bien thanh 200 o ma tran.
   */
  readonly maxRoutedCandidates: number;
  /**
   * TRAN so o mot ma tran duoc phep hoi. Chan TRUOC khi goi ra ngoai.
   *
   * 100 la con so co that trong tai lieu cua ca hai nha cung cap da khao sat: HERE gioi han ma
   * tran co tuy chon rieng + giao thong dong o 15x100 hoac 100x1; Google gioi han
   * `computeRouteMatrix` o 100 o khi dung `TRAFFIC_AWARE_OPTIMAL`. Lay so nho hon lam tran cua
   * chinh minh de he nay khong bao gio la ben phat hien gioi han bang mot loi HTTP.
   */
  readonly maxMatrixElements: number;
  /**
   * TRAN so lan hoi duong di de dung PHEP CHIEU "xe se ranh o dau" trong MOT lan mo bang.
   *
   * Tach khoi `maxMatrixElements` vi hai con so chan hai thu khac nhau: cai kia chan MOT loi goi
   * ma tran, cai nay chan TONG so loi goi le cho ca doi xe. Mot doi 10 xe voi ba chang dang cho
   * moi chiec dung het 30 lan; 60 cho gap doi cho luc du lieu day hon.
   *
   * Khi het tran, phep chieu cua nhung xe con lai tra ve `PARTIAL` kem
   * `ROUTING_UNAVAILABLE_FOR_REMAINING_LEG` — mot cau tra loi trung thuc, khong phai mot con so
   * doan cho du bang.
   */
  readonly maxProjectionRouteCalls: number;
  /**
   * BO NHO DEM ket qua dinh tuyen song bao lau, giay. `#277 M12`.
   *
   * 300 giay: du de mot nguoi mo bang, doc, cuon, roi bam xac nhan ma khong goi lai nha cung cap;
   * qua ngan de mot ket qua co giao thong tro thanh mot loi khai ve hien tai. `0` tat han bo dem.
   */
  readonly routeCacheTtlSeconds: number;
  /** So muc toi da giu trong bo dem. Chan tren bo nho — bo dem KHONG phai su that nghiep vu. */
  readonly routeCacheMaxEntries: number;
  /**
   * THOI GIAN LAM VIEC TAI MOI DIEM DUNG khi tinh gio xe se ranh, giay.
   *
   * `0`, VA DO LA MOT LUA CHON PHAI DOC KY. Khong mot nguon nghiep vu nao cua B hom nay noi mot
   * lan giao hang mat bao lau — `#243` F-series ghi moc thoi gian THAT nhung chua ai chot mot
   * dinh muc. Bia mot con so ("30 phut moi diem") se lam moi gio du bao sai theo mot huong ma
   * khong ai kiem duoc.
   *
   * Nen mac dinh la 0, va he thong NOI RA hau qua: moi `availableAt` deu mang co
   * `availableAtIsLowerBound = true` — "xe ranh KHONG SOM HON luc nay". Do la mot phat bieu dung,
   * va no van xep hang duoc. Khi B chot mot dinh muc, doi mot so o day.
   */
  readonly stopServiceSeconds: number;
  /**
   * HE SO DUONG VONG cua bo uoc luong TONG HOP — chi dung khi CHUA co nha cung cap nao.
   *
   * Ty so giua quang duong thuc te tren duong bo va duong chim bay. 1,3 la gia tri hay duoc dan
   * trong tai lieu quy hoach giao thong cho mang luoi duong lien tinh, va no CHI de con so xem
   * truoc nam dung bac do lon — khong de dieu mot chiec xe. Moi ket qua dung he so nay mang nhan
   * `SYNTHETIC` di suot toi DTO.
   */
  readonly syntheticDetourFactor: number;
  /** Toc do trung binh cua bo uoc luong tong hop, m/s. 13,9 m/s = 50 km/h. Cung mot canh bao. */
  readonly syntheticAverageSpeedMetresPerSecond: number;
  /** Thu tu xep hang dang hieu luc. Doi duoc, va ban thay doi di thang ra DTO. */
  readonly orderingKeys: readonly DispatchOrderingKey[];
  /**
   * CO PHEP de nghi CAT NGANG mot viec dang lam khong.
   *
   * `true` mac dinh: he thong VAN hien ung vien do, vi mot nguoi dieu xe co quyen biet rang chiec
   * xe gan nhat dang ban. Khoa `NO_WORK_INTERRUPTION` bao dam no khong bao gio dung dau bang khi
   * co mot lua chon khong cat ngang.
   */
  readonly includeInterruptingCandidates: boolean;
}

export const DEFAULT_TRANSPORT_DISPATCH_POLICY: TransportDispatchPolicy = {
  currentLocationFreshSeconds: 1_800,
  currentLocationUsableSeconds: 14_400,
  maxRoutedCandidates: 12,
  maxMatrixElements: 100,
  maxProjectionRouteCalls: 60,
  routeCacheTtlSeconds: 300,
  routeCacheMaxEntries: 512,
  stopServiceSeconds: 0,
  syntheticDetourFactor: 1.3,
  syntheticAverageSpeedMetresPerSecond: 13.9,
  orderingKeys: DISPATCH_ORDERING_KEYS,
  includeInterruptingCandidates: true,
};
