import { EMPTY_VALUE, formatCount } from '../customer-view';
import {
  canNavigateTo,
  findSection,
  type NavigationInput,
  type TransportSectionId,
} from '../navigation';
import type {
  ControlTowerView,
  FuelReconciliation,
  TransportOrder,
  Trip,
} from '../transport-types';
import { toControlTower, type ControlTowerModel, type SeverityTone } from './control-tower';
import { isTerminalTrip } from './trips';

/**
 * MO HINH KHUNG NHIN cua man Tong quan.
 *
 * LUAT CUA CA TEP, tu #161 §4.B: *"khong bia the bao duong/tuan thu/luong truoc khi TX-06/TX-07 co
 * san"*, va trang thai doi xe chi lay *"tu du lieu truoc T6 o cho nao noi that duoc"*. Mot bang dieu
 * khien day so trong do vai con so la uoc doan thi te hon mot bang thua so nhung moi so deu dung, vi
 * khong ai biet phai tin cai nao.
 *
 * ===========================================================================
 * SU THAT VAN HANH CHINH LA DON HANG + VONG CHAY, KHONG PHAI CHUYEN LAP TAY (#348)
 *
 * #339 dua `Đơn hàng & vòng chạy` len lam duong chinh va rut `Chuyến xe` xuong loi phu. Truoc ban
 * nay, Tong quan van dem VA dan hoan toan theo chuyen lap tay, nen mot khach da chuyen han sang lam
 * tu don thay "Chuyến đang chạy: 0" va "khong co viec" trong khi xe dang chay that.
 *
 *   · "Vòng chạy đang chạy" la `fleet.runningRuns` cua THAP DIEU HANH — dung con so man `Bảng điều
 *     hành` hien, tu cung mot lan goi, dem bang cung mot vi tu `isRunningRunStatus` o may chu (#336).
 *     Tep nay KHONG dem lai vong chay va khong doc `VehicleRun.status`: mot phep dem o day se la
 *     dinh nghia "đang chạy" thu ba cua cong ty, va no se lech o lan sua dinh nghia ke tiep.
 *   · Hang viec la hang viec cua thap dieu hanh (`toControlTower`), chi cat ngan lai — cung nhan,
 *     cung muc dich den, cung MA nghiep vu tren dia chi.
 *   · Chuyen lap tay chua khep chi con la THONG TIN PHU (`legacy`): khong thanh the so, khong cong
 *     chung voi vong chay, va la cho DUY NHAT tren man nay con dan vao `Chuyến xe`.
 *
 * ===========================================================================
 * DOI XE CUNG LA `fleet` CUA THAP DIEU HANH (#351)
 *
 *   · "Xe đang rỗi" / "Xe đang bảo dưỡng" / "Lái xe đang làm" la `fleet.idle` /
 *     `fleet.underMaintenance` / `fleet.activeDrivers` — DUNG ba con so ma `Bảng điều hành` in ra
 *     ("Đang rảnh" / "Đang sửa chữa" / "Lái xe đang hoạt động"), tu cung mot lan goi. Phep chieu
 *     may chu (`countFleetPresence`) dat moi xe vao DUNG MOT o: co vong chay `ACTIVE` thi vao o
 *     dang chay truoc, roi moi den `UNDER_MAINTENANCE`, con lai la rỗi (#336/#344).
 *   · Tep nay KHONG nhan danh sach xe hay lai xe, va KHONG dem `TransportVehicle.status`: do la cot
 *     nhap tay ma luong Order-first khong ghi, nen mot xe dang chay van co the luu `IDLE`. Dem lai
 *     o day la dinh nghia "xe rỗi" thu hai cua cong ty — dung cai lech ma #351 bat duoc.
 *
 * ===========================================================================
 * FAIL-CLOSED THEO HAI TRUC QUYEN
 *
 * Nguoi khong mo duoc `Bảng điều hành` — vi vai, vi goi khach, hay vi nang luc dang bi chan — KHONG
 * thay con so vong chay hay con so doi xe nao, ke ca so 0. So 0 o do doc ra la "khong xe nao
 * chay", tuc mot cau khang dinh ma man hinh khong co can cu; nen mo hinh tra mot CAU noi ro vi sao
 * khong co so.
 */

export interface DashboardStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string | null;
  /** Bam vao thi di dau — de con so tren bang la mot loi vao viec, khong phai mot trang tri. */
  readonly section: TransportSectionId | null;
}

/** Mot dong viec — CHINH la mot dong hang viec cua thap dieu hanh, khong phai mot ban chep lai. */
export interface DashboardWorkItem {
  readonly key: string;
  readonly title: string;
  readonly tone: SeverityTone;
  readonly section: TransportSectionId;
  /** MA nghiep vu de mo dung dong (vd ma vong chay), hoac `null`. KHONG BAO GIO la `id`. */
  readonly selection: string | null;
}

export interface DashboardLink {
  readonly label: string;
  readonly section: TransportSectionId;
}

/** Chuyen lap tay chua khep. `link` la `null` khi nguoi nay khong mo duoc `Chuyến xe`. */
export interface DashboardLegacyNote {
  readonly text: string;
  readonly link: DashboardLink | null;
}

export interface DashboardModel {
  /** Ngay nghiep vu cua lan doc thap dieu hanh (`dd/mm/yyyy`); `null` khi chua co. */
  readonly generatedFor: string | null;
  readonly stats: readonly DashboardStat[];
  /**
   * Cau noi VI SAO khong co con so vong chay khi nguoi nay KHONG mo duoc `Bảng điều hành`.
   *
   * `null` chi noi ve QUYEN, khong hua la da co so: nguoi co quyen van co the chua thay con so nao
   * trong luc thap dieu hanh dang doc hoac doc loi — luc do `headline` cung la `null`.
   */
  readonly operationsNotice: string | null;
  /** Da CAT xuong `WORK_LIMIT` de bay len bang. */
  readonly work: readonly DashboardWorkItem[];
  /**
   * TONG so viec dang cho — dem tren TOAN BO du lieu, khong phai `work.length`.
   *
   * Hai con so nay khac nhau ngay khi co hon `WORK_LIMIT` viec, va lay con so da bi cat lam tieu de
   * se BAO THIEU: 9 viec dang cho ma tieu de doc "6 viec". Mot bang dieu khien bao thieu viec con
   * te hon mot bang khong co con so nao.
   */
  readonly pendingTotal: number;
  readonly hasWork: boolean;
  /**
   * `null` khi CHUA BIET — dang doc, doc loi, hoac bi chan. Khong duoc noi "khong co viec" trong
   * luc chua co thap dieu hanh trong tay: do la mot cau ve hien truong ma man hinh chua co can cu.
   */
  readonly headline: string | null;
  /** Loi sang `Bảng điều hành` khi bang chi bay mot phan hang viec. */
  readonly moreWork: DashboardLink | null;
  readonly legacy: DashboardLegacyNote | null;
}

export interface DashboardInput {
  /**
   * Read model cua `Bảng điều hành` — `null` khi chua co trong tay: dang doc, doc loi, hoac query bi
   * chan tu dau. Ba truong hop do deu cho cung mot ket qua o day: KHONG co con so vong chay nao, va
   * KHONG co con so doi xe nao (#351) — khong co so 0, va khong co phep dem thay the.
   */
  readonly tower: ControlTowerView | null;
  /** Don hang — `null` khi chua co trong tay hoac vai khong doc duoc don. */
  readonly orders: readonly TransportOrder[] | null;
  /**
   * Chuyen lap tay — CHI de noi thong tin phu, khong bao gio thanh con so chinh. `null` khi chua co
   * trong tay (dang doc, hoac vai/goi khong doc duoc chuyen).
   */
  readonly trips: readonly Trip[] | null;
  /**
   * Lan doc chuyen lap tay vua HONG. Tach khoi `trips: null` vi hai dieu noi hai cau khac nhau: bi
   * chan thi im lang la dung, con doc hong ma im lang thi doc ra y het "khong con chuyen nao".
   */
  readonly tripsFailed: boolean;
  readonly reconciliations: readonly FuelReconciliation[];
  /** Hai truc quyen. Moi duong dan, moi con so vong chay va doi xe deu hoi qua day. */
  readonly navigation: NavigationInput;
}

/** Bao nhieu viec bay ra tren bang truoc khi chuyen sang "xem du o Bang dieu hanh". */
export const WORK_LIMIT = 6;

const OPEN_RECONCILIATION_STATES = new Set(['DRAFT', 'MATCHING', 'RESOLVED', 'REOPENED']);

/** Nhan cua muc lay tu CHINH danh muc — doi ten muc thi cau chu tren Tong quan doi theo. */
const sectionLabel = (section: TransportSectionId): string =>
  findSection(section)?.label ?? section;

/** Muc mo duoc thi con so dan vao do; khong mo duoc thi con so van la con so, chi khong dan di dau. */
const linkIf = (
  section: TransportSectionId,
  navigation: NavigationInput,
): TransportSectionId | null => (canNavigateTo(section, navigation) ? section : null);

/**
 * BA CON SO CHINH — don dang mo, vong chay dang chay, vong chay da len ke hoach.
 *
 * Hai con so vong chay doc NGUYEN tu thap dieu hanh: `runningRuns` la con so loi tom tat cua bang
 * noi ("Vòng chạy đang chạy: N trên M xe"), va the "đã lên kế hoạch" la tong tren dau cot cung ten
 * cua bang. Nhan mang DON VI ("Vòng chạy …") theo luat #336: chu "Đang chạy" khong dung tran.
 */
const operationStats = (
  input: DashboardInput,
  tower: ControlTowerView | null,
  board: ControlTowerModel | null,
): readonly DashboardStat[] => {
  const stats: DashboardStat[] = [];

  if (input.orders !== null) {
    stats.push({
      key: 'orders-open',
      label: 'Đơn đang mở',
      value: formatCount(input.orders.filter((order) => order.status === 'OPEN').length),
      hint: 'Chưa giao xong.',
      section: linkIf('movement', input.navigation),
    });
  }

  if (tower !== null && board !== null) {
    stats.push(
      {
        key: 'runs-running',
        label: 'Vòng chạy đang chạy',
        value: formatCount(tower.fleet.runningRuns),
        hint: `Trên ${formatCount(tower.fleet.onTrip)} xe.`,
        section: 'control-tower',
      },
      {
        key: 'runs-planned',
        label: 'Vòng chạy đã lên kế hoạch',
        value: board.columns.find((column) => column.column === 'PLANNED')?.total ?? EMPTY_VALUE,
        hint: 'Chưa bắt đầu chạy.',
        section: 'control-tower',
      },
    );
  }

  return stats;
};

/**
 * DOI XE VA LAI XE — `fleet` cua thap dieu hanh (#351), doc NGUYEN nhu the `runs-running` o tren.
 *
 * `tower === null` (dang doc, doc loi, bi chan) thi KHONG co the nao: khong co so 0, va khong co
 * phuong an du phong nao doc danh sach xe. Mot "Xe đang rỗi 3" dem tu cot trang thai xe trong luc
 * `Bảng điều hành` chua tra loi chinh la con so sai ma #351 go di — chi sai vao mot luc khac.
 *
 * Nhan cua Tong quan giu nguyen; con so la con so cua bang. Muc `fleet` khong mo duoc thi the van
 * la so that, chi khong dan di dau (luat #348).
 */
const fleetStats = (
  input: DashboardInput,
  tower: ControlTowerView | null,
): readonly DashboardStat[] => {
  if (tower === null) return [];
  const section = linkIf('fleet', input.navigation);
  return [
    {
      key: 'vehicles-idle',
      label: 'Xe đang rỗi',
      value: formatCount(tower.fleet.idle),
      hint: null,
      section,
    },
    {
      key: 'vehicles-maintenance',
      label: 'Xe đang bảo dưỡng',
      value: formatCount(tower.fleet.underMaintenance),
      /*
       * `UNDER_MAINTENANCE` van la nguon DUY NHAT ve bao duong cua `transport-core` (#336). Cau thu
       * hai noi thu tu uu tien cua phep chieu, de mot xe dang sua ma van chay khong lam ai di tim no.
       */
      hint: 'Đọc từ trạng thái xe, chưa phải từ lịch bảo dưỡng. Xe có vòng chạy đang chạy không tính ở đây.',
      section,
    },
    {
      key: 'drivers-active',
      label: 'Lái xe đang làm',
      value: formatCount(tower.fleet.activeDrivers),
      hint: null,
      section,
    },
  ];
};

/**
 * KY DOI SOAT — NGUON giu nguyen: the nay khong doc chuyen lap tay va khong thuoc thap dieu hanh.
 *
 * Luat fail-closed cua #348 van ap: chua co ky nao trong tay thi KHONG co the (khong bay mot so 0 vo
 * nghia), va muc `fuel` khong mo duoc thi the khong dan di dau.
 */
const reconciliationStats = (input: DashboardInput): readonly DashboardStat[] =>
  input.reconciliations.length === 0
    ? []
    : [
        {
          key: 'reconciliations-open',
          label: 'Kỳ đối soát đang mở',
          value: formatCount(
            input.reconciliations.filter((row) => OPEN_RECONCILIATION_STATES.has(row.state)).length,
          ),
          hint: null,
          section: linkIf('fuel', input.navigation),
        },
      ];

/**
 * BA NHANH, cung khuon `headlineFor` cua thap dieu hanh — va mot nhanh THEM.
 *
 * Khi khong co viec ma van co vong chay dang chay, cau tieu de noi CA HAI: day la dung cai tinh
 * huong #348 bat duoc, khi man hinh noi "khong co viec" canh mot con so 0 trong luc xe dang chay.
 * Khong noi "moi thu deu on" — chi noi la khong co viec CAN NGUOI.
 */
const headlineFor = (tower: ControlTowerView, shown: number): string => {
  const total = tower.queueTotal;
  if (total === 0) {
    return tower.fleet.runningRuns === 0
      ? 'Không có việc nào đang chờ người xử lý.'
      : `${formatCount(tower.fleet.runningRuns)} vòng chạy đang chạy, không có việc nào đang chờ người xử lý.`;
  }
  if (shown < total) {
    return `${formatCount(total)} việc đang chờ người xử lý — bảng đang hiện ${formatCount(shown)} việc đầu.`;
  }
  return `${formatCount(total)} việc đang chờ người xử lý.`;
};

/** Dong viec cua thap dieu hanh, cat o `WORK_LIMIT`. `selection` giu nguyen: MA, khong bao gio `id`. */
const workFrom = (board: ControlTowerModel): readonly DashboardWorkItem[] =>
  board.queue.slice(0, WORK_LIMIT).map((row) => ({
    key: row.key,
    title: row.title,
    tone: row.tone,
    section: row.section,
    selection: row.selection,
  }));

const legacyNoteFor = (input: DashboardInput): DashboardLegacyNote | null => {
  const link: DashboardLink | null = canNavigateTo('trips', input.navigation)
    ? { label: `Xem ở “${sectionLabel('trips')}”`, section: 'trips' }
    : null;

  if (input.tripsFailed) {
    return {
      text: 'Chưa đọc được các chuyến lập tay theo cách làm trước đây, nên chưa biết còn chuyến nào chưa khép.',
      link,
    };
  }
  if (input.trips === null) return null;

  const open = input.trips.filter((trip) => !isTerminalTrip(trip.status)).length;
  if (open === 0) return null;
  return {
    text: `Còn ${formatCount(open)} chuyến lập tay theo cách làm trước đây chưa khép.`,
    link,
  };
};

const operationsBlockedNotice = (): string =>
  `Tổng quan không hiện số vòng chạy, số liệu đội xe và hàng việc đang chờ: doanh nghiệp chưa bật hoặc chưa thiết lập xong nghiệp vụ vận hành xe, hoặc vai của bạn không mở được “${sectionLabel('control-tower')}”.`;

export const toDashboard = (input: DashboardInput): DashboardModel => {
  const canOpenTower = canNavigateTo('control-tower', input.navigation);
  const tower = canOpenTower ? input.tower : null;
  const board = tower === null ? null : toControlTower(tower);
  const work = board === null ? [] : workFrom(board);
  const pendingTotal = tower?.queueTotal ?? 0;

  return {
    generatedFor: board?.generatedFor ?? null,
    stats: [
      ...operationStats(input, tower, board),
      ...fleetStats(input, tower),
      ...reconciliationStats(input),
    ],
    operationsNotice: canOpenTower ? null : operationsBlockedNotice(),
    work,
    pendingTotal,
    hasWork: pendingTotal > 0,
    headline: tower === null ? null : headlineFor(tower, work.length),
    moreWork:
      pendingTotal > work.length
        ? {
            label: `Xem đủ ${formatCount(pendingTotal)} việc ở “${sectionLabel('control-tower')}”`,
            section: 'control-tower',
          }
        : null,
    legacy: legacyNoteFor(input),
  };
};
