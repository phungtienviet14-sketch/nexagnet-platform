/**
 * TRANG THAI VI TRI NOI THAT VOI LAI XE — thuan, test tren Node.
 *
 * Hai viec khac nhau, khong duoc gop:
 *   · VI TRI TAI MOT THOI DIEM (bam "Đã đến nơi"): can quyen "khi dung ung dung". Chay duoc tren moi
 *     may co GPS — do la duong CHAC CHAN cua bang chung hien truong.
 *   · BAM VI TRI NEN (ca chay): can quyen "luon luon" + dich vu tien canh (Android) + ban dung co bat
 *     tinh nang. Va ngay ca khi du ca ba, HE DIEU HANH van co the dung no: vuot khoi danh sach gan
 *     day/force-stop (Android), trinh tiet kiem pin cua hang may, terminate tren iOS. Ung dung
 *     KHONG BAO GIO noi "dang bam lien tuc" nhu mot su that — chi noi "da bat" va nhan manh nhung
 *     cach no co the dung. Chua co bang chung tren may that: RESEARCHED / NOT DEVICE-PROVEN.
 */
export type PermissionLevel = 'granted' | 'denied' | 'undetermined';

export interface LocationFacts {
  readonly servicesEnabled: boolean;
  readonly foreground: PermissionLevel;
  readonly foregroundCanAskAgain: boolean;
  readonly background: PermissionLevel;
  /** Ban dung nay CO tinh nang bam nen khong (APP_BACKGROUND_LOCATION luc build). */
  readonly buildSupportsBackground: boolean;
  /** Tac vu nen dang dang ky voi he dieu hanh (hasStartedLocationUpdatesAsync). */
  readonly backgroundTaskRunning: boolean;
  readonly platform: 'android' | 'ios' | 'web';
}

export type Tone = 'live' | 'caution' | 'danger' | 'neutral';

export interface LocationStatement {
  readonly pointInTime: { readonly ok: boolean; readonly tone: Tone; readonly text: string };
  readonly background: { readonly tone: Tone; readonly title: string; readonly detail: string };
}

const OS_LIMITS: Record<LocationFacts['platform'], string> = {
  android:
    'Hệ điều hành vẫn có thể dừng việc bám nếu bạn vuốt tắt ứng dụng khỏi danh sách gần đây, bấm "Buộc dừng", hoặc trình tiết kiệm pin của máy chặn. Khi đó văn phòng thấy "mất tín hiệu", không phải lỗi của bạn.',
  ios: 'Nếu bạn vuốt tắt hẳn ứng dụng, iOS ngừng gửi vị trí liên tục cho tới khi bạn mở lại. Khi đó văn phòng thấy "mất tín hiệu", không phải lỗi của bạn.',
  web: 'Bản xem trước trên trình duyệt không bám vị trí nền.',
};

export function describeLocation(facts: LocationFacts): LocationStatement {
  const pointInTime = !facts.servicesEnabled
    ? {
        ok: false,
        tone: 'danger' as const,
        text: 'Định vị của máy đang tắt — bật lại để bấm các mốc cần vị trí.',
      }
    : facts.foreground === 'granted'
      ? { ok: true, tone: 'live' as const, text: 'Lấy được vị trí khi bạn bấm mốc.' }
      : facts.foreground === 'denied' && !facts.foregroundCanAskAgain
        ? {
            ok: false,
            tone: 'danger' as const,
            text: 'Quyền vị trí đã bị từ chối. Mở Cài đặt của máy để cho phép — nếu không, các mốc "Đã đến nơi" và "Khách đã nhận" không ghi được.',
          }
        : {
            ok: false,
            tone: 'caution' as const,
            text: 'Ứng dụng sẽ xin quyền vị trí ở lần bấm mốc đầu tiên.',
          };

  if (!facts.buildSupportsBackground) {
    return {
      pointInTime,
      background: {
        tone: 'neutral',
        title: 'Bản này không bám vị trí nền',
        detail:
          'Vị trí chỉ được lấy đúng lúc bạn bấm mốc. Văn phòng sẽ thấy xe "không bật theo dõi" giữa các mốc — đó là trạng thái bình thường, không phải lỗi.',
      },
    };
  }
  if (facts.backgroundTaskRunning && facts.background === 'granted') {
    return {
      pointInTime,
      background: {
        tone: 'live',
        title: 'Đã bật bám vị trí ca chạy',
        detail: `Ứng dụng gửi vị trí trong lúc vòng chạy đang mở. ${OS_LIMITS[facts.platform]}`,
      },
    };
  }
  if (facts.background === 'denied') {
    return {
      pointInTime,
      background: {
        tone: 'neutral',
        title: 'Chưa cho phép vị trí "Luôn luôn"',
        detail:
          facts.platform === 'android'
            ? 'Android chỉ cho bật trong Cài đặt → Ứng dụng → Quyền → Vị trí → "Luôn cho phép". Không bật thì chỉ có vị trí lúc bấm mốc.'
            : 'Vào Cài đặt → Quyền riêng tư → Dịch vụ định vị → chọn "Luôn luôn". Không bật thì chỉ có vị trí lúc bấm mốc.',
      },
    };
  }
  return {
    pointInTime,
    background: {
      tone: 'neutral',
      title: 'Chưa bật bám vị trí ca chạy',
      detail: 'Không bắt buộc. Bật khi bắt đầu vòng chạy nếu công ty yêu cầu theo dõi hành trình.',
    },
  };
}

/** Loi lay vi tri tai mot thoi diem — cau chu giu dung tinh than web `driver-location.ts`. */
export type LocationFailure = 'SERVICES_OFF' | 'PERMISSION_DENIED' | 'TIMEOUT' | 'UNAVAILABLE';

export const LOCATION_FAILURE_TEXT: Record<LocationFailure, string> = {
  SERVICES_OFF:
    'Định vị của máy đang tắt nên không ghi được mốc. Bật định vị rồi bấm lại — mốc chưa được ghi.',
  PERMISSION_DENIED:
    'Chưa có quyền vị trí nên không ghi được mốc này. Cho phép vị trí rồi bấm lại — mốc chưa được ghi.',
  TIMEOUT: 'Chưa bắt được vị trí (máy đang dò GPS). Ra chỗ thoáng rồi bấm lại — mốc chưa được ghi.',
  UNAVAILABLE:
    'Máy không đọc được vị trí nên không ghi được mốc. Thử lại ở chỗ thoáng — mốc chưa được ghi.',
};

export class LocationCaptureError extends Error {
  constructor(readonly failure: LocationFailure) {
    super(LOCATION_FAILURE_TEXT[failure]);
    this.name = 'LocationCaptureError';
  }
}
