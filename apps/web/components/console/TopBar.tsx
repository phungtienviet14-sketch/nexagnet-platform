'use client';

import type { DemoConfig } from '@ultty/shared';

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
};

const PARSER_LABEL: Record<DemoConfig['parserMode'], string> = {
  deepseek: 'DeepSeek',
  claude: 'Claude',
  mock: 'Mock (offline)',
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
}: Props) {
  const botOn = config?.botMode === 'on';
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
        <span className={`sbadge ${botOn ? '' : 'off'}`}>
          <span className="dot" />
          Bot Zalo: {botOn ? 'ON' : 'OFF'}
        </span>
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
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Đổi tông sáng/tối">
          ◐ Tông
        </button>
      </div>
    </header>
  );
}
