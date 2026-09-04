'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { FocusTone } from '../../lib/settings-focus';

/**
 * Bo nguyen mau TIEU DIEM dung chung cho moi muc `/settings` (#146).
 *
 * Mot man hinh doc tu tren xuong theo dung bon tang:
 *
 *   A. `SettingsStatusBar`  — su that gon, CHI DOC, khong bao gio la vung thao tac thu hai;
 *   B. `SettingsWorkCard`   — viec dang lam, la khoi noi bat DUY NHAT tren trang;
 *   C. `SettingsAdvanced`   — thao tac phu / nang cao, mac dinh gap lai;
 *   D. `SettingsAdvanced`   — lich su, bang chung chi doc, luon o duoi.
 *
 * `SettingsActionRow` giu bat bien "mot nut chinh": no chi nhan MOT `primary`, va day hanh dong
 * pha huy sang mot cum tach roi ve khong gian. Neu ban thay minh muon truyen hai `primary`, viec
 * can lam la tach trang thai, khong phai noi long kieu du lieu.
 *
 * CO Y khong tu tao lop `settings-*` moi trong tep dung chung: toan bo lop o day nam trong
 * `settings-focus.css` voi tien to `settings-focus-*` / `settings-work-*`, de thay doi cua #146
 * khong the vo tinh de len bo lop ma man bang gia (#144/#127) dang dua vao.
 */

const TONE_LABEL: Readonly<Record<FocusTone, string>> = {
  ok: 'Đang ổn',
  attention: 'Cần xử lý',
  blocked: 'Đang chặn',
};

/* ------------------------------------------------------------- A. Trạng thái */

type StatusBarProps = {
  tone: FocusTone;
  title: string;
  detail?: string;
  /** Vai so lieu gon — KHONG phai nut. Thanh trang thai la boi canh, khong phai viec. */
  facts?: readonly { label: string; value: string }[];
};

export function SettingsStatusBar({ tone, title, detail, facts }: StatusBarProps) {
  return (
    <div className={`settings-focus-status settings-focus-status--${tone}`} role="status">
      <span className="settings-focus-status__tag">{TONE_LABEL[tone]}</span>
      <div className="settings-focus-status__body">
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
      {facts && facts.length > 0 && (
        <dl className="settings-focus-status__facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ B. Việc đang làm */

type WorkCardProps = {
  /** Nhan ngan phia tren tieu de — noi day la viec gi, khong phai he thong con nao. */
  eyebrow: string;
  title: string;
  /** Tro ngai hoac tien de NGAY TRUOC MAT, dat sat tieu de chu khong o mot the khac. */
  problem?: string;
  tone?: FocusTone;
  /** `id` cua tieu de — de `aria-labelledby` va de dieu huong ban phim tro toi duoc. */
  headingId: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  children?: ReactNode;
  actions?: ReactNode;
};

export function SettingsWorkCard({
  eyebrow,
  title,
  problem,
  tone = 'attention',
  headingId,
  headingRef,
  children,
  actions,
}: WorkCardProps) {
  return (
    <section
      className={`settings-work settings-work--${tone}`}
      aria-labelledby={headingId}
      data-settings-work="true"
    >
      <header className="settings-work__head">
        <p className="settings-eyebrow">{eyebrow}</p>
        {/* `tabIndex={-1}`: khong vao thu tu Tab, nhung nhan duoc tieu diem bang code khi trang
            thai doi — do la cach chuyen su chu y ma khong lam roi duong di ban phim. */}
        <h3 id={headingId} ref={headingRef} tabIndex={-1}>
          {title}
        </h3>
        {problem && <p className="settings-work__problem">{problem}</p>}
      </header>
      {children && <div className="settings-work__body">{children}</div>}
      {actions && <div className="settings-work__actions">{actions}</div>}
    </section>
  );
}

/* ----------------------------------------------------------- Cụm hành động */

type ActionRowProps = {
  /** DUY NHAT mot hanh dong chinh cho mot trang thai. */
  primary?: ReactNode;
  /** Toi da mot hanh dong phu dat canh hanh dong chinh. */
  secondary?: ReactNode;
  /** Hanh dong pha huy / vong doi — tach ra mot cum rieng ve khong gian. */
  tertiary?: ReactNode;
  /** Vi sao hanh dong chinh dang khoa — dat NGAY CANH nut, khong o cho khac. */
  blockedReason?: string;
};

export function SettingsActionRow({ primary, secondary, tertiary, blockedReason }: ActionRowProps) {
  return (
    <div className="settings-focus-actions">
      {/* Khong dung mot the rong: mot trang thai chi co ly do khoa (chua co hanh dong nao hop le)
          se de lai mot khoang trong kho hieu ngay giua khoi viec. */}
      {(primary || secondary) && (
        <div className="settings-focus-actions__main">
          {primary}
          {secondary}
        </div>
      )}
      {blockedReason && (
        <p className="settings-focus-actions__reason" role="note">
          {blockedReason}
        </p>
      )}
      {tertiary && <div className="settings-focus-actions__aside">{tertiary}</div>}
    </div>
  );
}

/* ------------------------------------------------- C/D. Nội dung phụ, gấp lại */

type AdvancedProps = {
  title: string;
  /** So luong/ghi chu ngan hien canh tieu de khi con dang gap. */
  hint?: string;
  /** Mo san khi va chi khi ben trong dang co mot tro ngai cua viec hien tai. */
  defaultOpen?: boolean;
  children: ReactNode;
};

export function SettingsAdvanced({ title, hint, defaultOpen = false, children }: AdvancedProps) {
  return (
    <details className="settings-focus-advanced" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {hint && <small>{hint}</small>}
      </summary>
      <div className="settings-focus-advanced__body">{children}</div>
    </details>
  );
}

/* --------------------------------------------------------- Hộp thoại có khoá */

type ModalProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  /** `danger` cho thao tac khong hoan tac duoc; `primary` cho thao tac binh thuong. */
  tone?: 'danger' | 'primary';
  pending?: boolean;
  /**
   * Hanh dong CHUA hop le ve cau truc (vd mat khau tam chua du do dai) — khoa bang `disabled` that.
   * KHONG dung co nay cho trang thai "dang cho may chu": xem `pending`.
   */
  confirmDisabled?: boolean;
  /**
   * Phan tu nhan lai tieu diem khi hop dong — DOC LUC DONG, khong chup luc mo.
   *
   * Vi sao khong chup luc mo: o vai man (vd Tai khoan), the chua nut da mo hop bi THAY THE trong
   * luc hop dang mo, nen mot tham chieu chup luc mo se tro vao mot nut da roi khoi DOM. Goi
   * `focus()` len mot nut nhu the khong bao loi — no lang le de tieu diem roi ve `<body>`.
   */
  returnFocus?: () => HTMLElement | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Hop thoai chung cho cac thao tac can xac nhan ngoai vong doi bang gia.
 *
 * `ConfirmDialog` hien co bi rang buoc vao `HighImpactConfirmation` (bon cau hoi cua #117 §5) va
 * thuoc luong bang gia, nen KHONG dung lai duoc cho "vo hieu hoa tai khoan" hay "huy chien dich".
 *
 * Hop nay so huu TRON VONG DOI TIEU DIEM cua chinh no (#154):
 *
 *  1. mo   -> tieu diem vao nut an toan (`Để sau`), Tab khong roi ra ngoai;
 *  2. cho  -> nut dang bam KHONG bao gio bi dat `disabled`; khoa bang `aria-disabled` + chan trong
 *             handler, vi dat `disabled` len chinh nut dang giu tieu diem thi trinh duyet nem tieu
 *             diem ve `<body>` (dung lop loi #144 da sua cho bang gia);
 *  3. dong -> tra tieu diem ve dung nut da mo no, doc LUC DONG chu khong chup luc mo.
 *
 * Cha KHONG con phai tu lo phan (3) bang mot co trang thai rong hon vong doi hop — do la khe ho
 * lam `manage -> reset -> manage` va `Duyệt/Hủy chiến dịch` khong bao gio khoi phuc duoc tieu diem.
 */
export function SettingsFocusModal({
  title,
  description,
  children,
  confirmLabel,
  tone = 'danger',
  pending = false,
  confirmDisabled = false,
  returnFocus,
  onConfirm,
  onCancel,
}: ModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Duong tra tieu diem, theo thu tu uu tien: cai cha khai bao (doc lai luc dong, chiu duoc viec
  // nut bi thay the), roi den phan tu dang giu tieu diem ngay TRUOC khi hop hien ra.
  const resolveReturn = useRef(returnFocus);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    resolveReturn.current = returnFocus;
  });

  useEffect(() => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    cancelRef.current?.focus();
    return () => {
      const node = resolveReturn.current?.() ?? opener.current;
      // `isConnected`: khi ca muc bi thao (dieu huong sang muc khac) thi khong con gi de tra ve, va
      // ep tieu diem len mot nut da roi khoi DOM chinh la cach lam no roi ve `<body>`.
      // `:disabled`: sau mot thao tac thanh cong, nut da mo hop co the tro thanh khong dung duoc
      // (vd `Đăng xuất an toàn` sau khi da dang xuat) — luc do dich dung la tieu de khoi viec moi,
      // va `useFocusOnKey` cua cha se dat tieu diem ngay sau lan don dep nay.
      if (!node?.isConnected || node.matches(':disabled')) return;
      node.focus({ preventScroll: true });
    };
  }, []);

  // Luoi an toan cho phan (2): neu mot phan tu con nao do bien mat trong luc cho (vd o nhap bi thay
  // bang mot dong trang thai), tieu diem duoc keo ve chinh hop chu khong duoc phep roi ra ngoai.
  useEffect(() => {
    if (!pending) return;
    const node = dialogRef.current;
    if (!node || node.contains(document.activeElement)) return;
    node.focus({ preventScroll: true });
  }, [pending]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, pending]);

  return (
    <div className="settings-dialog-backdrop">
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settings-focus-dialog-title"
        // Chi de nhan tieu diem BANG CODE khi khong con phan tu con nao nhan duoc — khong vao
        // thu tu Tab, nen duong ban phim binh thuong khong doi.
        tabIndex={-1}
      >
        <h3 id="settings-focus-dialog-title">{title}</h3>
        {description && <p className="settings-focus-dialog__lead">{description}</p>}
        {children}
        {/* KHOA VI DANG CHO MAY CHU -> `aria-disabled` + chan trong handler. Dat `disabled` len
            dung nut vua bam la cach chac chan nhat de mat tieu diem giua mot thao tac bat dong bo
            (#154 Finding B) — trinh duyet nem tieu diem ve `<body>` va nguoi dung ban phim phai
            Tab lai tu dau. KHOA VI CAU TRUC (`confirmDisabled`) van la `disabled` that: no doi
            theo mot o nhap trong hop, nen luc no bat len thi tieu diem dang o o nhap do. */}
        <div className="settings-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="settings-button settings-button--quiet"
            aria-disabled={pending || undefined}
            onClick={() => {
              if (pending) return;
              onCancel();
            }}
          >
            Để sau
          </button>
          <button
            type="button"
            className={`settings-button settings-button--${tone}`}
            disabled={confirmDisabled}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onClick={() => {
              if (pending || confirmDisabled) return;
              onConfirm();
            }}
          >
            {pending ? 'Đang thực hiện…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Tiêu điểm */

/**
 * Bang chung NHAN QUA: lan chuyen viec sap toi la do NGUOI VAN HANH gay ra.
 *
 * Vi sao khong dung lai "nguoi dung da tung cham vao trang" lam cong (#154 Finding A): sau lan cham
 * dau tien, co do bat len VINH VIEN. Nhieu khoa viec lai duoc suy ra thang tu du lieu may chu
 * (nhom trong `summary.groups`, kiem tra san sang, cong tac `autoSend`), va `/settings` tu nap lai
 * nen moi 15 giay. Ghep hai dieu do lai thi mot lan nap lai nen — hoac mot nguoi KHAC vua sua du
 * lieu — bi doc thanh "nguoi dung vua chuyen viec", va tieu diem nhay ra khoi o ma nguoi van hanh
 * dang go. Do la CUOP tieu diem, khong phai dan duong.
 *
 * Hop dong o day tach hai nguon thay doi ra:
 *
 *  - nguoi van hanh bam/go/chon  -> `requestFocus()` NGAY TRONG handler do -> duoc phep doi tieu diem;
 *  - du lieu nen ve / actor khac -> khong ai goi `requestFocus()` -> CHI cap nhat su that hien thi.
 *
 * Quy tac cho ben goi: chi `requestFocus()` trong handler that su dan toi mot lan doi VIEC. Mo mot
 * hop thoai, gap/mo mot khoi, doi bo loc hien thi thi KHONG goi — nhung viec do khong chuyen viec.
 */
export type FocusIntent = {
  /** Goi trong chinh handler cua nguoi van hanh, ngay truoc khi doi trang thai. */
  readonly requestFocus: () => void;
  /** Co noi bo cua `useFocusOnKey` — dung `useFocusIntent()` thay vi tu dung tay. */
  readonly requested: RefObject<boolean>;
};

export function useFocusIntent(): FocusIntent {
  const requested = useRef(false);
  // Mot `ref`, khong phai `state`: bam mot nut KHONG duoc keo theo mot lan render thua, va gia tri
  // chi can dung tai luc `useFocusOnKey` xu ly khoa moi.
  return useMemo(
    () => ({ requested, requestFocus: () => { requested.current = true; } }),
    [],
  );
}

/**
 * Chuyen tieu diem sang mot phan tu khi KHOA doi VA lan doi do do nguoi van hanh gay ra.
 *
 * Khoa phai la mot chuoi mo ta VIEC (vd `map-group:zca-group-2`), khong phai mot doi tuong du lieu.
 * `key === null` nghia la "chua co gi de chuyen tieu diem toi".
 */
export function useFocusOnKey(
  target: RefObject<HTMLElement | null>,
  key: string | null,
  intent: FocusIntent,
): void {
  const previous = useRef<string | null>(null);
  const { requested } = intent;
  useEffect(() => {
    if (key === null) return;
    if (previous.current === key) return;
    previous.current = key;
    // Tieu thu bang chung nhan qua DU CO chuyen tieu diem duoc hay khong: mot lan bam chi bao chung
    // cho DUNG MOT lan chuyen viec, khong bao chung cho moi lan du lieu ve sau do.
    const causedByOperator = requested.current;
    requested.current = false;
    if (!causedByOperator) return;
    const node = target.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [key, requested, target]);
}

/**
 * Tra tieu diem ve dung nut da mo mot LOP PHU TOAN MAN (bieu mau/trinh soan thay cho khoi viec),
 * khi lop phu do dong lai.
 *
 * KHONG dung cho `SettingsFocusModal`: hop thoai tu so huu vong doi tieu diem cua no qua
 * `returnFocus`. Dung ca hai cho cung mot hop la nguon goc cua #154 Finding B — co truyen vao day
 * la mot CHE DO CUA TRANG (vd `mode.kind !== 'list'`) rong hon vong doi hop, nen no khong bao gio
 * chuyen tu `true` sang `false` khi hop dong, va khong lan khoi phuc nao chay ca.
 *
 * Khong dung `document.activeElement` luc dong: luc do tieu diem thuong da roi ve `<body>`. Nen
 * phan tu kich hoat duoc ghi lai NGAY LUC MO.
 */
export function useRestoreFocus(open: boolean): {
  readonly rememberTrigger: (node: HTMLElement | null) => void;
} {
  const trigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return {
    rememberTrigger: (node: HTMLElement | null) => {
      trigger.current = node;
    },
  };
}

/** Enter/Space tren mot hang khong phai `<button>` — giu duong ban phim cho danh sach ban ghi. */
export function activateOnEnter(handler: () => void) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handler();
  };
}
