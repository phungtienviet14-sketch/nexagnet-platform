'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { buildGithubSourceUrl, type SourceContext, type SourceLocation } from '@netviet/shared';
import {
  EMPTY_IDE_PREFERENCES,
  IDE_CHOICES,
  buildEditorFileUri,
  ideRejectionMessage,
  loadIdePreferences,
  releaseMismatchWarning,
  saveIdePreferences,
  validateIdeSourceInput,
  type IdeId,
  type IdePreferences,
} from '../../lib/ide-debug';

/**
 * TU MOT BUOC TREN MAN HINH VE DUNG DONG MA NGUON da sinh ra no.
 *
 * ---------------------------------------------------------------------------
 * HAI NUT, HAI NGUON SU THAT KHAC NHAU — va man hinh phai noi ro dieu do (muc 16):
 *
 *   "Mo ma nguon"   -> GitHub, o DUNG git SHA ma runtime dang chay. Chinh xac tuyet doi.
 *   "Mo trong IDE"  -> thu muc TREN MAY NGUOI DUNG, o commit nao thi khong ai biet.
 *
 * Neu may nguoi dung dang o commit khac, cung mot so dong se tro toi mot doan ma khac. Gop hai
 * nut lai duoi mot cau "mo ma nguon" se lam nguoi debug tin rang ho dang doc dung doan vua chay
 * — va do la kieu sai lam ton nhieu gio nhat.
 *
 * ---------------------------------------------------------------------------
 * TIENG VIET O NHAN, MA KY THUAT GIU NGUYEN (muc 3).
 *
 * `OrdersService.sendConfirmation` va `apps/api/src/orders/orders.service.ts` KHONG duoc dich:
 * chung la thu nguoi ta dan vao o tim cua IDE. Chi nhan quanh chung la tieng Viet.
 */

/* --------------------------------------------------------------------------
 * KHO CAU HINH DUNG CHUNG
 *
 * `OrderFlowPanel` ve MOT `TraceViewer` cho MOI luot, nen mot don ba luot se co ba khung cung
 * doc mot tuy chon. Moi khung giu mot ban sao rieng bang `useState` thi sua o khung nay, hai
 * khung kia van dung gia tri cu cho toi khi tai lai trang — mot loi rat kho thay va rat de tin
 * la "IDE khong mo duoc".
 *
 * `useSyncExternalStore` tren mot kho duy nhat lam moi khung doc cung mot su that.
 * ------------------------------------------------------------------------ */

let cachedPreferences: IdePreferences | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): IdePreferences {
  cachedPreferences ??= loadIdePreferences();
  return cachedPreferences;
}

/** Render phia may chu khong co `localStorage` — tra ban rong de hai lan render khop nhau. */
function serverSnapshot(): IdePreferences {
  return EMPTY_IDE_PREFERENCES;
}

export function useIdePreferences(): [IdePreferences, (next: IdePreferences) => void] {
  const preferences = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const update = useCallback((next: IdePreferences) => {
    cachedPreferences = next;
    saveIdePreferences(next);
    for (const listener of listeners) listener();
  }, []);
  return [preferences, update];
}

/* ------------------------------------------------------------------------ */

/** `apps/api/src/orders/orders.service.ts:463`, hoac chi tep khi khong biet dong. */
function coordinates(source: SourceLocation): string {
  return source.line !== undefined ? `${source.filePath}:${source.line}` : source.filePath;
}

export function SourceLink({
  source,
  sourceContext,
}: {
  source: SourceLocation | undefined;
  sourceContext: SourceContext | undefined;
}) {
  const [preferences] = useIdePreferences();

  // KHONG BIET THI NOI LA KHONG BIET (muc 11). Mot dong trong o day doc len la "buoc nay khong
  // co van de gi", trong khi su that la "he thong khong biet buoc nay nam o dau".
  if (!source) {
    return (
      <span className="tv-source tv-source-missing">
        <span className="tv-source-key">Mã nguồn</span>
        Chưa có vị trí mã nguồn cho bước này.
      </span>
    );
  }

  const githubUrl = buildGithubSourceUrl(sourceContext ?? {}, source);
  const ideCheck = validateIdeSourceInput({
    workspaceRoot: preferences.workspaceRoot,
    filePath: source.filePath,
  });
  const ideUri = ideCheck.ok
    ? buildEditorFileUri({
        ide: preferences.ide,
        workspaceRoot: preferences.workspaceRoot,
        filePath: source.filePath,
        ...(source.line !== undefined ? { line: source.line } : {}),
      })
    : null;

  return (
    <span className="tv-source">
      <span className="tv-source-key">Mã nguồn</span>
      <span className="tv-source-where">
        {source.functionName && <code className="tv-code">{source.functionName}</code>}
        <code className="tv-code">{coordinates(source)}</code>
      </span>
      <span className="tv-source-actions">
        {githubUrl ? (
          <a
            className="tv-source-btn"
            href={githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            title={releaseMismatchWarning(source, sourceContext?.releaseSha)}
          >
            Mở mã nguồn
          </a>
        ) : (
          /*
            KHONG lui ve `/blob/main/…`. Runtime co the dang chay mot commit cu, va mot lien ket
            toi `main` se mo ra mot doan ma KHAC voi doan vua chay — nhung trong khong co dau
            hieu nao de nguoi doc biet.
          */
          <span className="tv-source-btn tv-source-btn-off" title="Thiếu repo hoặc bản phát hành">
            Chưa xác định bản phát hành
          </span>
        )}
        {ideUri ? (
          <a
            className="tv-source-btn"
            href={ideUri}
            title={releaseMismatchWarning(source, sourceContext?.releaseSha)}
          >
            Mở trong IDE
          </a>
        ) : (
          <span
            className="tv-source-btn tv-source-btn-off"
            title={ideCheck.ok ? '' : ideRejectionMessage(ideCheck.reason)}
          >
            Mở trong IDE
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * CAU HINH IDE — o lai trinh duyet, khong bao gio len may chu (muc 12, 13).
 *
 * Duong dan `C:\…\nexagnet-platform` la thong tin cua MOT CAI MAY. Dong bo no len may chu se
 * bien mot tuy chon ca nhan thanh du lieu cua he thong da khach — va lam mot ban ghi khong ai
 * xoa mang duong dan cua mot lap trinh vien cu.
 */
export function IdeSettingsPanel({ releaseSha }: { releaseSha?: string }) {
  const [preferences, update] = useIdePreferences();

  // Thu mo mot tep CHAC CHAN co o goc repo. Bam thu ma IDE khong bat len -> goc sai, va nguoi
  // dung biet ngay thay vi doan qua tung buoc mot.
  const probe = buildEditorFileUri({
    ide: preferences.ide,
    workspaceRoot: preferences.workspaceRoot,
    filePath: 'package.json',
  });

  return (
    <div className="tv-ide">
      <label className="tv-ide-field">
        <span>Trình soạn thảo</span>
        <select
          value={preferences.ide}
          onChange={(event) => update({ ...preferences, ide: event.target.value as IdeId })}
        >
          {IDE_CHOICES.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>

      <label className="tv-ide-field tv-ide-field-wide">
        <span>Thư mục repo trên máy</span>
        <input
          type="text"
          spellCheck={false}
          placeholder={String.raw`C:\repo\nexagnet-platform`}
          value={preferences.workspaceRoot}
          onChange={(event) => update({ ...preferences, workspaceRoot: event.target.value })}
        />
      </label>

      {probe ? (
        <a className="tv-source-btn" href={probe}>
          Kiểm tra mở IDE
        </a>
      ) : (
        <span className="tv-source-btn tv-source-btn-off">Kiểm tra mở IDE</span>
      )}

      <p className="tv-ide-note">{releaseMismatchWarning(undefined, releaseSha)}</p>
    </div>
  );
}
