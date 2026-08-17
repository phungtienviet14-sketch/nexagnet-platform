'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface NavSubItem {
  title: string;
  desc: string;
  href: string;
  badge?: string;
}

interface NavCategory {
  id: string;
  label: string;
  subItems: NavSubItem[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'products',
    label: 'Sản phẩm',
    subItems: [
      {
        title: 'Xử lý Đơn hàng (Order Automation)',
        desc: 'Biến tin nhắn đặt hàng hội thoại thành đơn hàng chuẩn xác có đối soát bảng giá và công nợ.',
        href: '/products/order-automation',
        badge: 'Sản phẩm Tiêu biểu',
      },
    ],
  },
  {
    id: 'solutions',
    label: 'Giải pháp',
    subItems: [

      {
        title: 'Bán hàng & Phân phối',
        desc: 'Hỗ trợ đội ngũ kinh doanh tiếp nhận nhu cầu và chuẩn hóa thông tin nhanh hơn.',
        href: '/solutions/sales',
      },
      {
        title: 'Chăm sóc Khách hàng',
        desc: 'Phản hồi nhất quán 24/7 theo tài liệu duyệt và chuyển giao chuyên viên mượt mà.',
        href: '/solutions/customer-service',
      },
      {
        title: 'Vận hành Doanh nghiệp',
        desc: 'Tự động hóa các tác vụ lặp lại và kiểm soát phân luồng theo quy tắc kinh doanh.',
        href: '/solutions/operations',
      },
      {
        title: 'Tri thức Nội bộ',
        desc: 'Hợp nhất quy trình, biểu mẫu và sổ tay vận hành tại một nguồn sự thật duy nhất.',
        href: '/solutions/internal-knowledge',
      },
    ],
  },
  {
    id: 'industries',
    label: 'Ngành',
    subItems: [
      {
        title: 'Bán lẻ & Phân phối',
        desc: 'Xử lý đơn hàng đại lý, tra cứu bảng giá và quản lý kênh trao đổi B2B.',
        href: '/industries/retail-distribution',
      },
      {
        title: 'Spa & Thẩm mỹ',
        desc: 'Tư vấn thông tin dịch vụ, tiếp nhận nhu cầu và hỗ trợ đặt lịch hẹn.',
        href: '/industries/spa-beauty',
      },
      {
        title: 'Bất động sản',
        desc: 'Giải đáp thông tin dự án, lọc nhu cầu khách hàng tiềm năng và chuyển giao môi giới.',
        href: '/industries/real-estate',
      },
      {
        title: 'Giáo dục & Đào tạo',
        desc: 'Tư vấn thông tin khóa học, giải đáp tuyển sinh và kết nối tư vấn viên.',
        href: '/industries/education',
      },
      {
        title: 'Khách sạn & Dịch vụ',
        desc: 'Tiếp nhận yêu cầu lưu trú, giải đáp tiện ích và hỗ trợ khách hàng 24/7.',
        href: '/industries/hospitality',
      },
    ],
  },
  {
    id: 'platform',
    label: 'Nền tảng',
    subItems: [
      {
        title: 'Tổng quan Nền tảng',
        desc: 'Kiến trúc AI Agent theo module kết nối từ kênh tiếp nhận đến thực thi.',
        href: '/platform',
      },
      {
        title: 'Kiểm soát & Quản trị',
        desc: 'Rules Engine tất định, Cổng kiểm duyệt nhân sự và Nhật ký kiểm toán toàn diện.',
        href: '/platform/control',
      },
      {
        title: 'Hạ tầng Tích hợp',
        desc: 'Triết lý kết nối linh hoạt với kênh trao đổi và phần mềm quản trị sẵn có.',
        href: '/platform/integrations',
      },
    ],
  },
  {
    id: 'resources',
    label: 'Tài nguyên',
    subItems: [
      {
        title: 'Câu hỏi Thường gặp',
        desc: 'Giải đáp mọi thắc mắc về năng lực, triển khai và an toàn dữ liệu.',
        href: '/resources/faq',
      },
      {
        title: 'Lộ trình Phát triển',
        desc: 'Định hướng mở rộng hệ sinh thái các module vận hành của nexagnet.',
        href: '/resources/roadmap',
      },
    ],
  },
];

export function Navbar() {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedCat, setMobileExpandedCat] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMouseEnter = (catId: string) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setActiveDropdown(catId);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 140);
  };

  return (
    <header
      ref={navRef}
      className={`navbar-root ${isScrolled ? 'navbar-scrolled' : ''}`}
      role="banner"
      onMouseLeave={handleMouseLeave}
    >
      <div className="container">
        <div className="navbar-inner">
          {/* Brand Wordmark */}
          <Link href="/" className="brand-link" aria-label="Trang chủ nexagnet" onClick={() => setActiveDropdown(null)}>
            <span className="brand-motif" aria-hidden="true">
              <span className="brand-dot" />
            </span>
            <span className="brand-wordmark">nexagnet</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <ul className="nav-list">
              {NAV_CATEGORIES.map((cat) => (
                <li
                  key={cat.id}
                  className="nav-item has-dropdown"
                  onMouseEnter={() => handleMouseEnter(cat.id)}
                >
                  <button
                    type="button"
                    className={`nav-link nav-btn-trigger ${activeDropdown === cat.id ? 'active' : ''}`}
                    aria-expanded={activeDropdown === cat.id}
                    onClick={() => setActiveDropdown(activeDropdown === cat.id ? null : cat.id)}
                  >
                    <span>{cat.label}</span>
                    <svg
                      className={`nav-chevron ${activeDropdown === cat.id ? 'open' : ''}`}
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* Mega Menu Dropdown */}
                  {activeDropdown === cat.id && (
                    <div
                      className="nav-mega-dropdown"
                      onMouseEnter={() => handleMouseEnter(cat.id)}
                      role="menu"
                    >
                      <div className="dropdown-grid">
                        {cat.subItems.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className="dropdown-item-card"
                            role="menuitem"
                            onClick={() => setActiveDropdown(null)}
                          >
                            <div className="item-header">
                              <span className="item-title">{sub.title}</span>
                              {sub.badge && <span className="item-badge">{sub.badge}</span>}
                            </div>
                            <p className="item-desc">{sub.desc}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Right Action CTA */}
          <div className="navbar-actions">
            <Link href="#demo" className="btn-primary btn-demo-nav" onClick={() => setActiveDropdown(null)}>
              <span>Yêu cầu Demo</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label="Mở danh mục điều hướng"
            >
              <span className={`hamburger-bar ${mobileMenuOpen ? 'open-top' : ''}`} />
              <span className={`hamburger-bar ${mobileMenuOpen ? 'open-mid' : ''}`} />
              <span className={`hamburger-bar ${mobileMenuOpen ? 'open-bot' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile Accordion Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-menu-dropdown" role="dialog" aria-modal="true">
            <nav aria-label="Điều hướng trên thiết bị di động">
              <div className="mobile-accordion-list">
                {NAV_CATEGORIES.map((cat) => (
                  <div key={cat.id} className="mobile-accordion-group">
                    <button
                      type="button"
                      className="mobile-cat-header"
                      onClick={() => setMobileExpandedCat(mobileExpandedCat === cat.id ? null : cat.id)}
                      aria-expanded={mobileExpandedCat === cat.id}
                    >
                      <span>{cat.label}</span>
                      <span className="mobile-chevron">{mobileExpandedCat === cat.id ? '−' : '+'}</span>
                    </button>

                    {mobileExpandedCat === cat.id && (
                      <div className="mobile-sub-list">
                        {cat.subItems.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className="mobile-sub-link"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <span className="sub-title">{sub.title}</span>
                            <span className="sub-desc">{sub.desc}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mobile-nav-cta">
                <Link
                  href="#demo"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>Yêu cầu Demo 1-1</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
