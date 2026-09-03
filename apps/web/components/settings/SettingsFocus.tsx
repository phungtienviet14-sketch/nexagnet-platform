'use client';

import {
  useEffect,
  useRef,
  useState,
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
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Hop thoai chung cho cac thao tac can xac nhan ngoai vong doi bang gia.
 *
 * `ConfirmDialog` hien co bi rang buoc vao `HighImpactConfirmation` (bon cau hoi cua #117 §5) va
 * thuoc luong bang gia, nen KHONG dung lai duoc cho "vo hieu hoa tai khoan" hay "huy chien dich".
 * O day giu dung hai hanh vi quan trong cua no: tieu diem vao nut HUY khi mo, va Tab khong roi ra
 * ngoai hop.
 */
export function SettingsFocusModal({
  title,
  description,
  children,
  confirmLabel,
  tone = 'danger',
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

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
      >
        <h3 id="settings-focus-dialog-title">{title}</h3>
        {description && <p className="settings-focus-dialog__lead">{description}</p>}
        {children}
        <div className="settings-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="settings-button settings-button--quiet"
            disabled={pending}
            onClick={onCancel}
          >
            Để sau
          </button>
          <button
            type="button"
            className={`settings-button settings-button--${tone}`}
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
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
 * Chuyen tieu diem sang mot phan tu khi KHOA doi — khong phai moi lan render.
 *
 * Rang buoc quan trong: React Query nap lai nen ngam moi 10-15 giay. Neu tieu diem chay theo
 * `data` thi con tro cua nguoi dang go se bi giat ra khoi o nhap moi lan nap lai. Khoa o day phai
 * la mot chuoi mo ta VIEC (vd `map-group:zca-group-2`), khong phai mot doi tuong du lieu.
 *
 * `key === null` nghia la "chua co gi de chuyen tieu diem toi" — dung cho lan render dau, de man
 * hinh khong tu cuop tieu diem ngay khi vua mo.
 */
/**
 * Nguoi dung DA cham vao trang chua?
 *
 * Day la ranh gioi giua "trang thai doi vi NGUOI VAN HANH vua lam gi do" va "trang thai doi vi DU
 * LIEU vua ve tu may chu". Chi truong hop dau tien moi duoc phep chuyen tieu diem. Mot man hinh tu
 * lay tieu diem trong khi nguoi dung chua cham vao no la mot loi thuc su: vien tieu diem bat len
 * lam nguoi ta tuong minh vua bam nham, va o mot man khac no cuop con tro khoi o dang go.
 */
function useHasInteracted(): boolean {
  const [interacted, setInteracted] = useState(false);
  useEffect(() => {
    if (interacted) return undefined;
    const mark = () => setInteracted(true);
    document.addEventListener('pointerdown', mark, { capture: true, once: true });
    document.addEventListener('keydown', mark, { capture: true, once: true });
    return () => {
      document.removeEventListener('pointerdown', mark, { capture: true });
      document.removeEventListener('keydown', mark, { capture: true });
    };
  }, [interacted]);
  return interacted;
}

export function useFocusOnKey(target: RefObject<HTMLElement | null>, key: string | null): void {
  const interacted = useHasInteracted();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    if (previous.current === key) return;
    previous.current = key;
    // MOT cong duy nhat, va no la cong dung: chua ai cham vao trang thi moi thay doi deu do du lieu
    // ve theo dot (summary xong roi readiness moi xong), khong phai do nguoi van hanh lam gi.
    if (!interacted) return;
    const node = target.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [interacted, key, target]);
}

/**
 * Tra tieu diem ve dung nut da mo mot lop phu, khi lop phu do dong lai.
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
