'use client';

import { useState } from 'react';
import { BroadcastTab } from '../components/BroadcastTab';
import { KiotVietTab } from '../components/KiotVietTab';
import { OrdersTab } from '../components/OrdersTab';

type Tab = 'orders' | 'broadcast' | 'kiotviet';

const TAB_TAGS: Record<Tab, string> = {
  orders: 'Trợ lý đơn hàng',
  broadcast: 'Khuyến mãi',
  kiotviet: 'KiotViet (mock)',
};

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Ultty AI</h1>
          <span className="tag">{TAB_TAGS[tab]}</span>
        </div>
      </header>

      <div className="tab-body">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'broadcast' && <BroadcastTab />}
        {tab === 'kiotviet' && <KiotVietTab />}
      </div>

      <nav className="tabbar" aria-label="Điều hướng">
        <button
          type="button"
          className={`tab ${tab === 'orders' ? 'tab-active' : ''}`}
          aria-current={tab === 'orders'}
          onClick={() => setTab('orders')}
        >
          <span className="tab-icon">🧾</span>
          <span>Đơn hàng</span>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'broadcast' ? 'tab-active' : ''}`}
          aria-current={tab === 'broadcast'}
          onClick={() => setTab('broadcast')}
        >
          <span className="tab-icon">📣</span>
          <span>Khuyến mãi</span>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'kiotviet' ? 'tab-active' : ''}`}
          aria-current={tab === 'kiotviet'}
          onClick={() => setTab('kiotviet')}
        >
          <span className="tab-icon">📦</span>
          <span>KiotViet</span>
        </button>
      </nav>
    </main>
  );
}
