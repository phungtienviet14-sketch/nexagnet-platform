import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  JPEG_CONTENT_TYPE,
  JPEG_QUALITY,
  PDF_CONTENT_TYPE,
  captureModeOf,
  fileSizeProblem,
  hasKnownSize,
  isPdf,
  resizeTarget,
  type CaptureSource,
} from './normalize';

/**
 * LAY TEP CHUNG TU — MOT API cho Android, iOS va trinh duyet (cac thu vien Expo deu co ban web).
 *
 * Moi lua chon tra MOT trong bon ket cuc — lop goi khong phai doan:
 *   OK        tep da chuan hoa (anh -> JPEG <= 2000px), kem `captureMode` NOI THAT nguon anh;
 *   CANCELLED nguoi dung dong hop chon — khong phai loi, khong noi gi;
 *   DENIED    thieu quyen — noi ro va chi duong mo Cai dat;
 *   FAILED    thu vien/tep hong — noi ro, khong xep hang gi.
 */
export interface PickedFile {
  readonly uri: string;
  readonly contentType: string;
  readonly captureMode: 'LIVE_CAMERA' | 'GALLERY' | 'UNKNOWN';
}

export type PickOutcome =
  | { readonly kind: 'OK'; readonly file: PickedFile }
  | { readonly kind: 'CANCELLED' }
  | { readonly kind: 'DENIED'; readonly message: string }
  | { readonly kind: 'FAILED'; readonly message: string };

const LIBRARY_DENIED =
  'Chưa có quyền xem thư viện ảnh. Mở Cài đặt để cho phép, hoặc chụp ảnh trực tiếp.';
const CAMERA_DENIED =
  'Chưa có quyền dùng máy ảnh. Mở Cài đặt để cho phép, hoặc chọn ảnh từ thư viện.';

/** Ve lai anh thanh JPEG, canh dai <= 2000px — HEIC cua iPhone khong nam trong danh sach may chu nhan. */
export async function normalizeImage(uri: string, width: number, height: number): Promise<string> {
  let target = resizeTarget(width, height);
  if (!hasKnownSize(width, height)) {
    const probe = await ImageManipulator.manipulate(uri).renderAsync();
    target = resizeTarget(probe.width, probe.height);
  }
  const context = ImageManipulator.manipulate(uri);
  if (target) context.resize(target);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return saved.uri;
}

async function imageOutcome(
  asset: { uri: string; width: number; height: number; fileSize?: number | null },
  source: CaptureSource,
): Promise<PickOutcome> {
  try {
    const uri = await normalizeImage(asset.uri, asset.width, asset.height);
    return {
      kind: 'OK',
      file: { uri, contentType: JPEG_CONTENT_TYPE, captureMode: captureModeOf(source) },
    };
  } catch {
    return { kind: 'FAILED', message: 'Không đọc được ảnh này — chụp hoặc chọn ảnh khác.' };
  }
}

/** "Chọn từ thư viện" — anh CU, may chu ghi la `GALLERY`. */
export async function pickFromLibrary(): Promise<PickOutcome> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted && permission.accessPrivileges !== 'limited') {
      return { kind: 'DENIED', message: LIBRARY_DENIED };
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { kind: 'CANCELLED' };
    return await imageOutcome(asset, 'LIBRARY');
  } catch {
    return { kind: 'FAILED', message: 'Không mở được thư viện ảnh trên máy này.' };
  }
}

/** Du phong cho trinh duyet khong dung duoc may anh trong trang: `<input capture>` cua he thong. */
export async function captureWithSystemCamera(): Promise<PickOutcome> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: 'DENIED', message: CAMERA_DENIED };
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { kind: 'CANCELLED' };
    return await imageOutcome(asset, 'BROWSER_CAPTURE');
  } catch {
    return { kind: 'FAILED', message: 'Không mở được máy ảnh trên máy này.' };
  }
}

/** Anh vua chup bang may anh TRONG ung dung — `LIVE_CAMERA`. */
export async function fromInAppCamera(photo: {
  uri: string;
  width: number;
  height: number;
}): Promise<PickOutcome> {
  return imageOutcome(photo, 'IN_APP_CAMERA');
}

/** "Chọn tệp PDF" — nguon khong chung minh duoc, may chu ghi `UNKNOWN`. */
export async function pickPdf(): Promise<PickOutcome> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: PDF_CONTENT_TYPE,
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { kind: 'CANCELLED' };
    if (!isPdf(asset.mimeType, asset.name)) {
      return {
        kind: 'FAILED',
        message: 'Tệp này không phải PDF — chọn lại, hoặc chụp ảnh chứng từ.',
      };
    }
    const tooBig = fileSizeProblem(asset.size);
    if (tooBig) return { kind: 'FAILED', message: tooBig };
    return {
      kind: 'OK',
      file: { uri: asset.uri, contentType: PDF_CONTENT_TYPE, captureMode: captureModeOf('FILE') },
    };
  } catch {
    return { kind: 'FAILED', message: 'Không mở được hộp chọn tệp trên máy này.' };
  }
}
