import { resolveBasemap, type Basemap } from './basemap';

/**
 * CAU HINH NEN BAN DO cua ban dung — doc MOT lan tu bien `EXPO_PUBLIC_*` (Expo nhung gia tri vao
 * luc dung; phai viet dung ten day du thi Metro moi thay the duoc). Khong phai bi mat.
 */
export const BASEMAP: Basemap = resolveBasemap({
  provider: process.env.EXPO_PUBLIC_MAP_PROVIDER ?? null,
  styleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? null,
});

/** Mau cham theo LOAI diem — mau trang thai co nghia, khong dung ho phach (danh cho viec ke tiep). */
export interface PointColors {
  readonly pickup: string;
  readonly delivery: string;
  readonly me: string;
  readonly vehicle: string;
  readonly stale: string;
  readonly halo: string;
}
