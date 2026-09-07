'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * DUA KHOI CHI TIET VAO TAM MAT khi no vua mo ra.
 *
 * ==============================================================================================
 * TRIEU CHUNG DUOC SUA O DAY
 *
 * Moi man danh sach ve khoi chi tiet SAU bang. Bang dai bao nhieu thi khoi do tut xuong sau bay
 * nhieu: bam mot phieu nhien lieu o giua danh sach roi phai cuon qua ca trang moi doc duoc thu vua
 * bam. Nguoi dung bao cao dung cau "phai cuon mai xuong cuoi de xem".
 *
 * Man Chuyen xe con co duong rieng — bam mot dong thi ma chuyen di vao o tim kiem, nen bang co lai
 * mot dong (`tripFilterForSelection`). Nhung duong do CHI dung duoc cho mot danh sach co o tim
 * kiem theo dung dinh danh cua dong; cac man con lai khong co, nen chung dung cach nay.
 *
 * ==============================================================================================
 * KHOA la mot CHUOI MO TA VIEC, khong phai mot doi tuong du lieu
 *
 * `openKey` doi ⇒ nguoi dung vua mo mot thu KHAC. `null` = khong co gi dang mo. Nho vay hook chay
 * dung cho ca khoi duoc thao lap lai theo `key` (TripsView) lan khoi song suot nhieu lan chon
 * (FuelInbox) — cung mot hop dong, khong hai duong.
 *
 * ==============================================================================================
 * VI SAO `block: 'nearest'`
 *
 * `'nearest'` cuon DUNG BANG khoang thieu. Khoi da nam trong tam mat thi khong cuon gi ca — mot cu
 * giat trang khi nguoi dung bam dong thu hai cua mot danh sach ngan la thu lam ho mat dau vet
 * chinh cho ho vua bam.
 *
 * `prefers-reduced-motion` duoc doc THAT, dung cong thuc cua `SettingsFocus.useFocusOnKey` de hai
 * cho khong troi khoi nhau: cuon truot muot la hoat anh, va he dieu hanh cua nguoi dung da noi ro
 * ho khong muon hoat anh thi khong duoc coi do la ngoai le.
 */
export function useRevealOnOpen<T extends HTMLElement>(
  openKey: string | null,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (openKey === null) return;
    const node = ref.current;
    // Moi truong khong biet cuon (jsdom) thi thoi. Khoi chi tiet KHONG duoc hong vi mot thu trang
    // tri — no van phai doc duoc.
    if (node === null || typeof node.scrollIntoView !== 'function') return;
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [openKey]);

  return ref;
}
