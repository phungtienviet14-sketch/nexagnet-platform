import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua NHAN VIEC TAI DIA DIEM A — `#267` H2/H3/H4.
 *
 * Mot cong nghiep vu co N duong tu choi phai phan biet duoc N ly do. O day so duong tu choi lon
 * bat thuong, va do khong phai mot dau hieu xau: gan nhu MOI dieu ma `#267` H7 doi phai chan deu
 * la mot duong rieng, va gop chung lai se lam chinh cai bang chung ma H7 yeu cau bien mat.
 */

/* ------------------------------------------------------------------ *
 * site_intake.propose — SiteIntakeService.propose()
 * ------------------------------------------------------------------ */
export const SITE_INTAKE_PROPOSE_REASONS = [
  /** Dung mot dia diem, va diem nam CHAC CHAN trong hang rao cua no. */
  'SITE_PROPOSAL_UNIQUE',
  /** Nhieu dia diem hop ly, hoac mot dia diem ma sai so phu len bien. May chu KHONG chon ho. */
  'SITE_PROPOSAL_AMBIGUOUS',
  'SITE_PROPOSAL_NO_MATCH',
  /** Vi tri khong dung duoc — mot cau tra loi RIENG, khong phai `NO_MATCH`. */
  'SITE_PROPOSAL_LOCATION_UNUSABLE',
  /**
   * Lai xe DANG cam mot vong chay chua ket thuc.
   *
   * Van tra ve de nghi dia diem — man hinh can biet lai xe dang o dau de in ra *"Ban dang o Cong
   * ty ABC / Chuyen hien tai: RUN-..."* — nhung `canCreate` la `false`. `#267` H3.
   */
  'SITE_PROPOSAL_OPEN_RUN_EXISTS',
  'SITE_INTAKE_DRIVER_BINDING_MISSING',
] as const;
export type SiteIntakeProposeReason = (typeof SITE_INTAKE_PROPOSE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * site_intake.confirm — SiteIntakeService.confirm()
 * ------------------------------------------------------------------ */
export const SITE_INTAKE_CONFIRM_REASONS = [
  /** Mot con nguoi da bam, va dung MOT vong chay toi thieu da duoc tao. */
  'SITE_INTAKE_CREATED',
  /**
   * Gui lai DUNG lenh cu — tra ve chinh vong chay da tao, khong tao ban thu hai.
   *
   * Ket qua CHO PHEP chu khong phai loi: cham hai lan va mot hang doi ngoai tuyen phat lai deu la
   * chuyen thuong ngay o hien truong. `#267` H3 doi dung dieu nay.
   */
  'SITE_INTAKE_REPLAYED',
  'SITE_INTAKE_DRIVER_BINDING_MISSING',
  /** Lai xe chua duoc giao xe nao — khong co gi de ghi vao vong chay. `#267` H4. */
  'SITE_INTAKE_NO_ASSIGNED_VEHICLE',
  /** Dia diem khong co that, hoac thuoc mot pham vi ma lai xe nay khong thay. Fail-closed. */
  'SITE_INTAKE_SITE_NOT_FOUND',
  /** Dia diem da nghi. Mot kho dong cua khong duoc tro thanh diem bat dau cua mot chuyen moi. */
  'SITE_INTAKE_SITE_INACTIVE',
  /**
   * Lai xe DANG cam mot vong chay chua ket thuc — `#267` H3, va H7
   * *"Driver cannot create a second active run when an applicable current run exists"*.
   */
  'SITE_INTAKE_OPEN_RUN_EXISTS',
  /**
   * Nguoi goi CO gui vi tri, nhung vi tri do khong dung duoc (sai so qua lon, qua han tuoi, toa
   * do vo nghia).
   *
   * Tu choi chu khong lang le ha xuong `DRIVER_REPORTED`: gui mot vi tri LA mot loi khai ve chung
   * cu, va `#267` H7 cam mot vi tri qua han *"silently"* tao/gan mot lan lay hang. Lai xe khong co
   * dinh vi thi dung gui truong nao ca — duong do van mo, va no de lai nhan `DRIVER_REPORTED`.
   */
  'SITE_INTAKE_LOCATION_UNUSABLE',
  /**
   * Vi tri dung duoc, nhung dia diem duoc chon KHONG nam trong so ung vien cua chinh vi tri do.
   *
   * Day la cong chan mot man hinh (hoac mot script) chon bua mot `siteId` roi dinh kem mot toa do
   * that de trong nhu da o do.
   */
  'SITE_INTAKE_SITE_NOT_A_CANDIDATE',
  'SITE_INTAKE_OBSERVATION_NOT_FOUND',
  /** Ban dinh vi cua NGUOI KHAC. Muon vi tri dong nghiep lam bang chung cho chinh minh. */
  'SITE_INTAKE_OBSERVATION_NOT_OWNED',
  /** Ban dinh vi do da lam bang chung cho mot lan nhan viec khac. */
  'SITE_INTAKE_OBSERVATION_ALREADY_USED',
] as const;
export type SiteIntakeConfirmReason = (typeof SITE_INTAKE_CONFIRM_REASONS)[number];

export type TransportSiteIntakeDecisionReason = SiteIntakeProposeReason | SiteIntakeConfirmReason;

export const TRANSPORT_SITE_INTAKE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-site-intake',
  points: ['site_intake.propose', 'site_intake.confirm'],
  labels: {
    SITE_PROPOSAL_UNIQUE: 'Nhận ra đúng một địa điểm',
    SITE_PROPOSAL_AMBIGUOUS: 'Nhiều địa điểm hợp lý — để người chọn',
    SITE_PROPOSAL_NO_MATCH: 'Không có địa điểm nào quanh đây',
    SITE_PROPOSAL_LOCATION_UNUSABLE: 'Vị trí hiện tại chưa dùng được',
    SITE_PROPOSAL_OPEN_RUN_EXISTS: 'Lái xe đang có chuyến chưa kết thúc',
    SITE_INTAKE_DRIVER_BINDING_MISSING: 'Tài khoản chưa nối với một hồ sơ lái xe nào',

    SITE_INTAKE_CREATED: 'Đã tạo một vòng chạy tối thiểu sau xác nhận của lái xe',
    SITE_INTAKE_REPLAYED: 'Gửi lại đúng lệnh cũ — trả về vòng chạy đã tạo',
    SITE_INTAKE_NO_ASSIGNED_VEHICLE: 'Lái xe chưa được giao xe nào',
    SITE_INTAKE_SITE_NOT_FOUND: 'Không tìm thấy địa điểm vận hành',
    SITE_INTAKE_SITE_INACTIVE: 'Địa điểm đã nghỉ',
    SITE_INTAKE_OPEN_RUN_EXISTS: 'Đã có chuyến chưa kết thúc — ghi vào chuyến đó',
    SITE_INTAKE_LOCATION_UNUSABLE: 'Vị trí gửi lên không dùng được',
    SITE_INTAKE_SITE_NOT_A_CANDIDATE: 'Địa điểm được chọn không nằm quanh vị trí đã gửi',
    SITE_INTAKE_OBSERVATION_NOT_FOUND: 'Không tìm thấy bản định vị',
    SITE_INTAKE_OBSERVATION_NOT_OWNED: 'Bản định vị đó không thuộc về bạn',
    SITE_INTAKE_OBSERVATION_ALREADY_USED: 'Bản định vị đó đã dùng cho một lần nhận việc khác',
  } satisfies Record<TransportSiteIntakeDecisionReason, string>,
});
