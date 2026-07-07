'use client';

import { useState } from 'react';
import { KiotVietTab } from '../components/KiotVietTab';
import { OrdersTab } from '../components/OrdersTab';

type Tab = 'orders' | 'kiotviet';

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Ultty AI</h1>
          <span className="tag">{tab === 'orders' ? 'Trợ lý đơn hàng' : 'KiotViet (mock)'}</span>
        </div>
      </header>

      <div className="tab-body">{tab === 'orders' ? <OrdersTab /> : <KiotVietTab />}</div>

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
