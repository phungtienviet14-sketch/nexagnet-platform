import type { PriceWorkflowMode } from './price-workflow';

/**
 * MOT viec -> MOT khoi chiem uu the -> MOT nut chinh.
 *
 * Man bang gia truoc day dung dan cua no roi (#127 sap dung thu tu, #132 khoa noi dung Xem lai),
 * nhung van bay QUA NHIEU khoi cung trong luong nhau tai cung mot luc: the "chinh thuc", the
 * "chay thu", trinh tao, khong gian lam viec, lich su, va ca danh muc san pham ben duoi. Nguoi van
 * hanh doc xong van con phai TU QUYET DINH nhin vao dau — do la mot viec ma man hinh phai lam ho.
 *
 * Tep nay tra loi ba cau do bang DU LIEU, khong bang cach rai class trong JSX:
 *
 *  1. Toi dang o buoc nao?      -> `stage`
 *  2. Toi phai xu ly khoi nao?  -> `dominantRegion` (dung MOT)
 *  3. Nut chinh tiep theo?      -> `primaryAction`  (dung MOT)
 *
 * Vi la ham thuan nen "chi co mot khoi chiem uu the" va "chi co mot nut chinh" tro thanh dieu KIEM
 * TRA DUOC, thay vi mot loi hua trong CSS. Man hinh danh dau khoi do bang `data-price-dominant` va
 * nut do bang `data-price-primary`, roi bai kiem dem so phan tu mang thuoc tinh do.
 */

/**
 * `idle`    — khong co viec nao dang lam; viec can lam la BAT DAU.
 * `wizard`  — trinh tao dang mo; no so huu ca trang.
 * `edit`    — dang sua mot ban nhap.
 * `review`  — dang doc lai truoc khi kich hoat; day la mot man QUYET DINH.
 * `settled` — dang xem mot ky chi doc; trang thai la thu chinh, khong phai o nhap.
 */
export type PriceFocusStage = 'idle' | 'wizard' | 'edit' | 'review' | 'settled';

/** Khoi duy nhat duoc phep chiem uu the thi giac o moi trang thai. */
export type PriceDominantRegion = 'start' | 'wizard' | 'work' | 'status';

/** Nut chinh duy nhat cua trang thai. `none` = trang thai nay khong co viec gi de bam. */
export type PricePrimaryAction =
  | 'create'
  | 'wizard-continue'
  | 'check-continue'
  | 'activate'
  | 'none';

/**
 * Trang thai thang hien tai la NOI DUNG CHINH hay chi la NGU CANH.
 *
 * `full`    — khong co viec nao dang lam, nen trang thai chinh no la thu phai doc.
 * `compact` — dang co mot viec; trang thai lui ve mot dai tom tat. KHONG bi an di: #144 cam giau
 *             su that ve bang gia chinh thuc va ve ky chay thu dang ap dung.
 */
export type PriceContextDensity = 'full' | 'compact';

/** Nut tao bang gia chi duoc ve o DUNG MOT cho, va trong luong cua no doi theo trang thai. */
export type PriceCreateButtonPlacement =
  | 'hidden'
  | 'start-primary'
  | 'header-primary'
  | 'header-quiet';

export interface PriceFocusView {
  readonly stage: PriceFocusStage;
  readonly dominantRegion: PriceDominantRegion;
  readonly primaryAction: PricePrimaryAction;
  readonly contextDensity: PriceContextDensity;
  readonly createButton: PriceCreateButtonPlacement;
  /** Lich su, ban nhap khac va danh muc lui ve nen khi man hinh dang dan mot viec cu the. */
  readonly backgroundContent: boolean;
  /**
   * Cac the ngu canh co mang nut phu ("Xem chi tiết") hay khong.
   *
   * Tach khoi `contextDensity` co chu y: o trang thai `idle` cac the VUA thu gon VUA phai giu
   * duong vao, vi neu bo nut di thi mot ky dang ap dung co the khong con cho nao bam vao — no
   * khong nam trong muc lich su (lich su chi gom ky thang khac va ky da luu tru).
   */
  readonly contextActions: boolean;
}

export interface PriceFocusInput {
  readonly wizardOpen: boolean;
  readonly workflowMode: PriceWorkflowMode;
  /** Co mot ky dang duoc mo ra xem/sua hay khong. */
  readonly hasSelection: boolean;
  /** Vai tro chi doc thi khong co nut tao nao ca — noi that thay vi ve mot nut bam khong duoc. */
  readonly canConfigure: boolean;
}

/**
 * Doc trang thai tap trung tu du lieu — THUAN, khong nho gi giua hai lan goi.
 *
 * Thu tu cac nhanh la co y: trinh tao mo thi no so huu ca trang, KE CA khi dang co mot ban nhap
 * mo san. Hai khong gian lam viec cung luc chinh la thu #144 yeu cau bo.
 */
export function resolvePriceFocus(input: PriceFocusInput): PriceFocusView {
  const { wizardOpen, workflowMode, hasSelection, canConfigure } = input;

  if (wizardOpen) {
    return {
      stage: 'wizard',
      dominantRegion: 'wizard',
      primaryAction: 'wizard-continue',
      contextDensity: 'compact',
      // Trinh tao da co nut chinh cua no roi; mot nut "Tao bang gia" thu hai canh do la vo nghia.
      createButton: 'hidden',
      backgroundContent: true,
      contextActions: false,
    };
  }

  if (!hasSelection) {
    return {
      stage: 'idle',
      dominantRegion: 'start',
      primaryAction: canConfigure ? 'create' : 'none',
      // #144 §1: chua co viec nao thi trang thai thang hien tai la TOM TAT, va danh muc san pham
      // ben duoi la thu phu — viec can lam la BAT DAU, va no phai la thu noi nhat man hinh.
      contextDensity: 'compact',
      createButton: canConfigure ? 'start-primary' : 'hidden',
      backgroundContent: true,
      contextActions: true,
    };
  }

  if (workflowMode === 'edit') {
    return {
      stage: 'edit',
      dominantRegion: 'work',
      primaryAction: 'check-continue',
      contextDensity: 'compact',
      createButton: canConfigure ? 'header-quiet' : 'hidden',
      backgroundContent: true,
      contextActions: false,
    };
  }

  if (workflowMode === 'review') {
    return {
      stage: 'review',
      dominantRegion: 'work',
      primaryAction: 'activate',
      contextDensity: 'compact',
      createButton: canConfigure ? 'header-quiet' : 'hidden',
      backgroundContent: true,
      contextActions: false,
    };
  }

  return {
    stage: 'settled',
    dominantRegion: 'status',
    primaryAction: canConfigure ? 'create' : 'none',
    contextDensity: 'full',
    createButton: canConfigure ? 'header-primary' : 'hidden',
    backgroundContent: false,
    contextActions: true,
  };
}

/** Nut tao co duoc ve o dai tieu de khong — va co phai la nut chinh o do khong. */
export function createButtonInHeader(view: PriceFocusView): boolean {
  return view.createButton === 'header-primary' || view.createButton === 'header-quiet';
}
