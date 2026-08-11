'use client';

import type { DemoConfig } from '@netviet/shared';

export type ConsoleView = 'console' | 'broadcast';

type Props = {
  orderCount: number;
  pendingCount: number;
  groupCount: number;
  config?: DemoConfig;
  view: ConsoleView;
  onViewChange: (view: ConsoleView) => void;
  streaming: boolean;
  connected: boolean;
  autoSendPending: boolean;
  onAutoSendChange: (enabled: boolean) => void;
};

const PARSER_LABEL: Record<DemoConfig['parserMode'], string> = {
  deepseek: 'DeepSeek',
  flowise: 'Flowise · DeepSeek',
  claude: 'Claude',
  mock: 'Mock (offline)',
};

const CHANNEL_LABEL: Record<DemoConfig['channelMode'], string> = {
  mock: 'Mock (offline)',
  bot: 'Bot Zalo',
  zca: 'Zalo Web cá nhân',
  hybrid: 'Bot Zalo + cá nhân',
};

const CHANNEL_TITLE: Record<DemoConfig['channelMode'], string> = {
  mock: 'Không gửi/đọc Zalo — demo qua ô Bơm tin thử',
  bot: 'Zalo Bot Platform (chính thức) — chỉ nhận tin @mention bot',
  zca: 'zca-js: đăng nhập tài khoản cá nhân, đọc MỌI tin trong nhóm (không cần tag). Dùng tài khoản phụ.',
  hybrid: 'Hai Bot cùng nhóm: tag Bot Zalo thì Bot Zalo xử lý; không tag thì tài khoản cá nhân xử lý.',
};

function toggleTheme() {
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : prefersDark ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
}

export function TopBar({
  orderCount,
  pendingCount,
  groupCount,
  config,
  view,
  onViewChange,
  streaming,
  connected,
  autoSendPending,
  onAutoSendChange,
}: Props) {
  const channelMode = config?.channelMode ?? 'mock';
  const autoSendOn = config?.autoSend === 'on';
  const liveOn = streaming && connected;
  return (
    <header className="topbar">
      <div className="brand">
        <h1>Ultty AI</h1>
        <span className="sub">Trung tâm điều hành</span>
      </div>

      <div className="status-badges">
        <span className={`sbadge ${liveOn ? '' : 'off'}`} title={streaming ? 'Streaming SSE' : 'Chế độ polling'}>
          <span className="dot" />
          {streaming ? (connected ? 'LIVE' : 'kết nối…') : 'Polling'}
        </span>
        <span className={`sbadge ${channelMode !== 'mock' ? '' : 'off'}`} title={CHANNEL_TITLE[channelMode]}>
          <span className="dot" />
          Kênh: {CHANNEL_LABEL[channelMode]}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={autoSendOn}
          disabled={!config || autoSendPending}
          className={`sbadge autosend-toggle ${autoSendOn ? 'autosend' : 'off'}`}
          onClick={() => onAutoSendChange(!autoSendOn)}
          title={
            autoSendOn
              ? 'AI tự chốt + gửi đơn khi không có rủi ro (Giám sát phát hiện vấn đề mới gọi Sale)'
              : 'AI soạn, Sale duyệt 1-chạm'
          }
        >
          <span className="dot" />
          {autoSendPending ? 'Đang đổi…' : `Tự gửi: ${autoSendOn ? 'ON' : 'OFF'}`}
        </button>
        <span className="sbadge ai">
          <span className="dot" />
          AI: {config ? PARSER_LABEL[config.parserMode] : '…'}
        </span>
      </div>

      <div className="topbar-right">
        <div className="counter">
          <b className="num">{orderCount}</b>
          <span>Đơn</span>
        </div>
        <div className="counter">
          <b className="num">{pendingCount}</b>
          <span>Chờ duyệt</span>
        </div>
        <div className="counter">
          <b className="num">{groupCount}</b>
          <span>Nhóm</span>
        </div>
        <button
          type="button"
          className={`nav-btn ${view === 'console' ? 'active' : ''}`}
          onClick={() => onViewChange('console')}
          aria-pressed={view === 'console'}
        >
          🖥 Đơn hàng
        </button>
        <button
          type="button"
          className={`nav-btn ${view === 'broadcast' ? 'active' : ''}`}
          onClick={() => onViewChange('broadcast')}
          aria-pressed={view === 'broadcast'}
        >
          📣 Khuyến mãi
        </button>
        {config?.zaloOperatorUrl && (
          <a className="nav-btn nav-link" href={config.zaloOperatorUrl} target="_blank" rel="noreferrer">
            Kết nối Zalo
          </a>
        )}
        {/* Cua vao DUY NHAT cho /settings. Thieu no thi ca trang cau hinh nguon su that va
            thanh vien nhom deu khong the tim ra tu giao dien — dung loi da gap 04/08/2026. */}
        <a className="nav-btn nav-link nav-link--settings" href="/settings">
          <span aria-hidden="true">⚙</span> Cấu hình
        </a>
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Đổi tông sáng/tối">
          ◐ Tông
        </button>
      </div>
    </header>
  );
}
