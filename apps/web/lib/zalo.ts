export type ZaloConnectionState =
  | 'disabled'
  | 'logged_out'
  | 'connecting'
  | 'qr_ready'
  | 'qr_scanned'
  | 'ready'
  | 'error';

export interface ZaloStatus {
  channelMode: 'mock' | 'bot' | 'zca';
  state: ZaloConnectionState;
  displayName?: string;
  qrVersion: number;
  qrExpiresAt?: string;
  allowedGroupIds: string[];
  error?: string;
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
