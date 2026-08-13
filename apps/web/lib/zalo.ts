export type ZaloConnectionState =
  | 'disabled'
  | 'logged_out'
  | 'connecting'
  | 'qr_ready'
  | 'qr_scanned'
  | 'ready'
  | 'error';

export interface ZaloStatus {
  channelMode: 'mock' | 'bot' | 'zca' | 'hybrid';
  state: ZaloConnectionState;
  displayName?: string;
  qrVersion: number;
  qrExpiresAt?: string;
  allowedGroupIds: string[];
  error?: string;
  botIdentity?: {
    state: 'disabled' | 'unknown' | 'ready' | 'error';
    id?: string;
    name?: string;
  };
}

export interface ZaloGroup {
  id: string;
  name: string;
  memberCount: number;
  allowed: boolean;
}

const STATE_LABELS: Record<ZaloConnectionState, string> = {
  disabled: 'Kênh ZCA đang tắt',
  logged_out: 'Chưa đăng nhập',
  connecting: 'Đang kết nối Zalo…',
  qr_ready: 'Quét QR bằng ứng dụng Zalo',
  qr_scanned: 'Đã quét — hãy xác nhận trên điện thoại',
  ready: 'Đã kết nối Zalo',
  error: 'Kết nối Zalo gặp lỗi',
};

export function zaloStateLabel(state: ZaloConnectionState): string {
  return STATE_LABELS[state];
}

export interface ZaloRiskAcknowledgement {
  id: 'tos_risk' | 'secondary_account';
  label: string;
  detail: string;
}

/**
 * Hai rui ro PHAI doc va xac nhan rieng truoc khi tao QR — khong gop thanh mot dong "toi da hieu",
 * vi hai viec nay dung sai cach thi hong theo hai kieu khac han nhau.
 *
 * Day la ghi nhan co truy vet, KHONG phai cong chan: he thong khong tu kiem duoc so dien thoai
 * nao la SIM rieng. Xac nhan o day duoc luu vao nhat ky thay doi (`zalo.login.risk_accepted`).
 */
export const ZALO_RISK_ACKNOWLEDGEMENTS: readonly ZaloRiskAcknowledgement[] = [
  {
    id: 'tos_risk',
    label: 'Tôi hiểu tài khoản Zalo này có thể bị khóa bất cứ lúc nào',
    detail:
      'Cách kết nối này (userbot qua Zalo Web) không phải kênh chính thức và vi phạm điều khoản sử dụng của Zalo. Zalo có quyền khóa tài khoản mà không báo trước. Khi bị khóa, hệ thống ngừng đọc tin ngay — tin nhắn phát sinh trong lúc đó Zalo KHÔNG gửi lại.',
  },
  {
    id: 'secondary_account',
    label: 'Tôi đang dùng tài khoản phụ với SIM riêng, không phải tài khoản Sale chính',
    detail:
      'Nếu đăng nhập bằng tài khoản Sale đang dùng hằng ngày thì lúc Zalo khóa là mất luôn kênh làm việc của Sale, không chỉ mất hệ thống. Lưu ý thêm: mỗi tài khoản chỉ chạy được MỘT phiên đọc tin — mở Zalo Web bằng chính tài khoản này sẽ làm hệ thống ngừng nhận tin.',
  },
] as const;

export type ZaloLoginAvailability =
  | { kind: 'available' }
  | { kind: 'connected' }
  | { kind: 'channel_locked'; title: string; detail: string }
  | { kind: 'loading' };

/**
 * Vi sao man hinh nay chua cho dang nhap. Truoc day khi `CHANNEL_MODE=mock` trang chi hien dong
 * "Kenh ZCA dang tat" roi het — nguoi van hanh khong biet do la CO Y hay hong, va di tim nut khong
 * ton tai. Tach ra khoi component de kiem duoc bang test.
 */
export function zaloLoginAvailability(status: ZaloStatus | undefined): ZaloLoginAvailability {
  if (!status) return { kind: 'loading' };
  if (status.channelMode === 'mock' || status.channelMode === 'bot') {
    return {
      kind: 'channel_locked',
      title: `Kênh Zalo đang khóa ở chế độ “${status.channelMode}” — đây là chủ ý`,
      detail:
        'Bản triển khai này cố tình không đọc/gửi Zalo thật. Mở khóa là việc của người deploy (đổi CHANNEL_MODE), và chỉ làm sau khi đã có văn bản chấp nhận rủi ro của khách và đã nhập đủ bảng giá tháng hiện hành — trình tự ở checklist go-live. Không có gì để bấm trên màn hình này.',
    };
  }
  if (status.state === 'logged_out' || status.state === 'error') return { kind: 'available' };
  return { kind: 'connected' };
}
