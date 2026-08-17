'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  IconExecutive,
  IconSales,
  IconMarketing,
  IconCSKH,
  IconOperations,
  IconFinance,
  IconHR,
  IconRetail,
  IconManufacturing,
  IconLogistics,
  IconHealthcare,
  IconSpa,
  IconFnB,
  IconFinancialServices,
  IconConstruction,
  IconRealEstate,
  IconProfessionalServices,
  IconEducation,
  IconHospitality,
  IconOrderAutomation,
  IconKnowledgeTruth,
  IconCampaign,
  IconControlRules,
  IconArchitectureLayers,
  IconIntegrationsHub,
} from '@/components/shared/EnterpriseIcons';

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
              {/* 1. QUẢN TRỊ PHÒNG BAN (Executive & Departments) */}
              <li
                className="nav-item has-dropdown"
                onMouseEnter={() => handleMouseEnter('departments')}
              >
                <button
                  type="button"
                  className={`nav-link nav-btn-trigger ${activeDropdown === 'departments' ? 'active' : ''}`}
                  aria-expanded={activeDropdown === 'departments'}
                  onClick={() => setActiveDropdown(activeDropdown === 'departments' ? null : 'departments')}
                >
                  <span>Quản trị Phòng ban</span>
                  <svg
                    className={`nav-chevron ${activeDropdown === 'departments' ? 'open' : ''}`}
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

                {activeDropdown === 'departments' && (
                  <div
                    className="nav-mega-dropdown mega-departments-layout"
                    onMouseEnter={() => handleMouseEnter('departments')}
                    role="menu"
                  >
                    {/* Left Strategic Focus: 1 người chủ quản lý cả doanh nghiệp */}
                    <div className="mega-callout-panel executive-callout">
                      <div className="callout-eyebrow">
                        <span className="eyebrow-dot" />
                        <span>DÀNH CHO CHỦ DOANH NGHIỆP</span>
                      </div>
                      <h4 className="callout-title">Ban Giám đốc (Executive)</h4>
                      <p className="callout-desc">
                        Hướng tới <strong>1 người chủ có thể quản lý toàn bộ doanh nghiệp của mình</strong>. Lọc sạch nhiễu vận hành, nhìn toàn cảnh luồng việc và chỉ can thiệp vào các ngoại lệ quan trọng.
                      </p>
                      <Link
                        href="/departments/executive"
                        className="callout-action-btn"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <IconExecutive size={16} color="var(--brand-accent)" />
                        <span>Mở Trung tâm Điều hành</span>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>

                      <div className="callout-footer-note">
                        <Link href="/departments" className="view-all-link" onClick={() => setActiveDropdown(null)}>
                          Xem tổng quan 7 phòng ban →
                        </Link>
                      </div>
                    </div>

                    {/* Right Department Grid (6 liên thông) */}
                    <div className="mega-dept-grid">
                      <div className="grid-header-label">CÁC PHÒNG BAN LIÊN THÔNG QUY TRÌNH</div>
                      <div className="dept-cards-2col">
                        <Link href="/departments/sales" className="nav-dept-card" onClick={() => setActiveDropdown(null)}>
                          <div className="card-icon-box"><IconSales size={18} color="var(--text-primary)" /></div>
                          <div className="card-info">
                            <span className="dept-name">Phòng Bán hàng (Sales)</span>
                            <span className="dept-tagline">Tiếp nhận lead, tra giá đại lý &amp; bóc tách đơn hàng</span>
                          </div>
                        </Link>

                        <Link href="/departments/operations" className="nav-dept-card" onClick={() => setActiveDropdown(null)}>
                          <div className="card-icon-box"><IconOperations size={18} color="var(--text-primary)" /></div>
                          <div className="card-info">
                            <span className="dept-name">Phòng Vận hành (Operations)</span>
                            <span className="dept-tagline">Luân chuyển tác vụ &amp; quản trị hàng đợi công việc</span>
                          </div>
                        </Link>

                        <Link href="/departments/customer-service" className="nav-dept-card" onClick={() => setActiveDropdown(null)}>
                          <div className="card-icon-box"><IconCSKH size={18} color="var(--text-primary)" /></div>
                          <div className="card-info">
                            <span className="dept-name">Chăm sóc Khách hàng (CSKH)</span>
                            <span className="dept-tagline">Phản hồi 24/7 theo cẩm nang duyệt &amp; chuyển ngoại lệ</span>
                          </div>
                        </Link>

                        <Link href="/departments/finance" className="nav-dept-card" onClick={() => setActiveDropdown(null)}>
                          <div className="card-icon-box"><IconFinance size={18} color="var(--text-primary)" /></div>
                          <div className="card-info">
                            <span className="dept-name">Tài chính &amp; Kế toán (Finance)</span>
                            <span className="dept-tagline">Đối soát chứng từ, hóa đơn &amp; hạn mức công nợ</span>
                          </div>
                        </Link>

                        <Link href="/departments/marketing" className="nav-dept-card" onClick={() => setActiveDropdown(null)}>
                          <div className="card-icon-box"><IconMarketing size={18} color="var(--text-primary)" /></div>
                          <div className="card-info">
                            <span className="dept-name">Phòng Tiếp thị (Marketing)</span>
                            <span className="dept-tagline">Phân loại lead tương tác &amp; chiến dịch an toàn</span>
                          </div>
                        </Link>

                        <Link href="/departments/hr" className="nav-dept-card" onClick={() => setActiveDropdown(null)}>
                          <div className="card-icon-box"><IconHR size={18} color="var(--text-primary)" /></div>
                          <div className="card-info">
                            <span className="dept-name">Nhân sự &amp; Nội bộ (HR)</span>
                            <span className="dept-tagline">Giải đáp cẩm nang quy chế &amp; duyệt phiếu đề xuất</span>
                          </div>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </li>

              {/* 2. GIẢI PHÁP NGÀNH (12 Ngành giải quyết vấn đề nhức nhối) */}
              <li
                className="nav-item has-dropdown"
                onMouseEnter={() => handleMouseEnter('industries')}
              >
                <button
                  type="button"
                  className={`nav-link nav-btn-trigger ${activeDropdown === 'industries' ? 'active' : ''}`}
                  aria-expanded={activeDropdown === 'industries'}
                  onClick={() => setActiveDropdown(activeDropdown === 'industries' ? null : 'industries')}
                >
                  <span>Giải pháp Ngành</span>
                  <span className="nav-count-badge">12</span>
                  <svg
                    className={`nav-chevron ${activeDropdown === 'industries' ? 'open' : ''}`}
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

                {activeDropdown === 'industries' && (
                  <div
                    className="nav-mega-dropdown mega-industries-layout"
                    onMouseEnter={() => handleMouseEnter('industries')}
                    role="menu"
                  >
                    {/* Left Strategic Callout */}
                    <div className="mega-callout-panel industry-callout">
                      <div className="callout-eyebrow">
                        <span className="eyebrow-dot" />
                        <span>AI VẬN HÀNH THEO NGÀNH</span>
                      </div>
                      <h4 className="callout-title">Xử lý Nút thắt Vận hành Đặc thù</h4>
                      <p className="callout-desc">
                        Không dùng kịch bản chung chung. Nexagnet cấu hình <strong>Rules Engine và Tri thức chuyên sâu</strong> để xử lý chính xác các vấn đề nhức nhối theo từng ngành nghề.
                      </p>

                      <div className="callout-highlights-list">
                        <div className="hl-item">✓ 12 mô hình ngành chuẩn hóa</div>
                        <div className="hl-item">✓ Đối soát bảng giá &amp; cước tất định</div>
                        <div className="hl-item">✓ Luân chuyển đa phòng ban</div>
                      </div>

                      <div className="callout-footer-note">
                        <Link href="/#industries" className="view-all-link" onClick={() => setActiveDropdown(null)}>
                          Xem bảng đối chiếu 12 ngành →
                        </Link>
                      </div>
                    </div>

                    {/* Right Clustered Grid (3 cụm ngành gọn gàng) */}
                    <div className="mega-industry-clusters">
                      {/* Cụm 1: Phân phối, Sản xuất & Logistics */}
                      <div className="cluster-column">
                        <div className="cluster-title">PHÂN PHỐI &amp; SẢN XUẤT</div>
                        <div className="cluster-links">
                          <Link href="/industries/retail-distribution" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconRetail size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Bán lẻ &amp; Phân phối (B2B)</span>
                              <span className="ind-sub">Dồn đơn Zalo &amp; công nợ</span>
                            </div>
                          </Link>

                          <Link href="/industries/manufacturing" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconManufacturing size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Sản xuất &amp; Gia công</span>
                              <span className="ind-sub">Định mức &amp; Lệnh sản xuất</span>
                            </div>
                          </Link>

                          <Link href="/industries/logistics" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconLogistics size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Vận tải &amp; Logistics</span>
                              <span className="ind-sub">Tính cước tuyến &amp; POD</span>
                            </div>
                          </Link>

                          <Link href="/industries/construction-interior" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconConstruction size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Xây dựng &amp; Nội thất</span>
                              <span className="ind-sub">Dự toán BOQ &amp; vật tư</span>
                            </div>
                          </Link>
                        </div>
                      </div>

                      {/* Cụm 2: Dịch vụ, Y tế & F&B */}
                      <div className="cluster-column">
                        <div className="cluster-title">Y TẾ &amp; DỊCH VỤ</div>
                        <div className="cluster-links">
                          <Link href="/industries/healthcare-clinic" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconHealthcare size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Y tế &amp; Phòng khám</span>
                              <span className="ind-sub">Lịch khám &amp; nhắc tái khám</span>
                            </div>
                          </Link>

                          <Link href="/industries/spa-beauty" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconSpa size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Spa, Thẩm mỹ &amp; Sức khỏe</span>
                              <span className="ind-sub">Liệu trình &amp; lịch hẹn 24/7</span>
                            </div>
                          </Link>

                          <Link href="/industries/fnb-chains" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconFnB size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Chuỗi Nhà hàng (F&B)</span>
                              <span className="ind-sub">Đặt bàn &amp; Bếp trung tâm</span>
                            </div>
                          </Link>

                          <Link href="/industries/hospitality" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconHospitality size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Khách sạn &amp; Dịch vụ</span>
                              <span className="ind-sub">Luân chuyển việc đa bộ phận</span>
                            </div>
                          </Link>
                        </div>
                      </div>

                      {/* Cụm 3: Tài chính, BĐS & Tư vấn */}
                      <div className="cluster-column">
                        <div className="cluster-title">TÀI CHÍNH &amp; TƯ VẤN</div>
                        <div className="cluster-links">
                          <Link href="/industries/financial-services" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconFinancialServices size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Tài chính &amp; Bảo hiểm</span>
                              <span className="ind-sub">Hồ sơ bồi thường &amp; thẩm định</span>
                            </div>
                          </Link>

                          <Link href="/industries/real-estate" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconRealEstate size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Bất động sản &amp; Sàn GD</span>
                              <span className="ind-sub">Lọc nhu cầu &amp; tài liệu dự án</span>
                            </div>
                          </Link>

                          <Link href="/industries/professional-services" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconProfessionalServices size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Luật &amp; Dịch vụ DN</span>
                              <span className="ind-sub">Cẩm nang thủ tục &amp; biểu phí</span>
                            </div>
                          </Link>

                          <Link href="/industries/education" className="cluster-item" onClick={() => setActiveDropdown(null)}>
                            <IconEducation size={16} color="var(--text-primary)" />
                            <div className="cluster-text">
                              <span className="ind-name">Giáo dục &amp; Tuyển sinh</span>
                              <span className="ind-sub">Tư vấn khóa &amp; lịch hẹn</span>
                            </div>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </li>

              {/* 3. NỀN TẢNG & KIỂM SOÁT */}
              <li
                className="nav-item has-dropdown"
                onMouseEnter={() => handleMouseEnter('platform')}
              >
                <button
                  type="button"
                  className={`nav-link nav-btn-trigger ${activeDropdown === 'platform' ? 'active' : ''}`}
                  aria-expanded={activeDropdown === 'platform'}
                  onClick={() => setActiveDropdown(activeDropdown === 'platform' ? null : 'platform')}
                >
                  <span>Nền tảng</span>
                  <svg
                    className={`nav-chevron ${activeDropdown === 'platform' ? 'open' : ''}`}
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

                {activeDropdown === 'platform' && (
                  <div
                    className="nav-mega-dropdown mega-standard-layout"
                    onMouseEnter={() => handleMouseEnter('platform')}
                    role="menu"
                  >
                    <div className="dropdown-grid">
                      <Link href="/platform" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <div className="item-title-row">
                            <IconArchitectureLayers size={16} color="var(--text-primary)" />
                            <span className="item-title">Tổng quan Nền tảng (Platform)</span>
                          </div>
                        </div>
                        <p className="item-desc">Kiến trúc AI Operating Layer kết nối quy trình, dữ liệu và con người trong doanh nghiệp.</p>
                      </Link>

                      <Link href="/platform/control" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <div className="item-title-row">
                            <IconControlRules size={16} color="var(--text-primary)" />
                            <span className="item-title">Kiểm soát &amp; Quản trị (Control)</span>
                          </div>
                          <span className="item-badge">Cốt lõi</span>
                        </div>
                        <p className="item-desc">AI hiểu · Rules quyết định · Con người kiểm soát. Rules Engine tất định và Audit Trail 100%.</p>
                      </Link>

                      <Link href="/platform/integrations" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <div className="item-title-row">
                            <IconIntegrationsHub size={16} color="var(--text-primary)" />
                            <span className="item-title">Hạ tầng Tích hợp (Integrations)</span>
                          </div>
                        </div>
                        <p className="item-desc">Triết lý kết nối mở với các kênh giao tiếp và phần mềm quản trị sẵn có của doanh nghiệp.</p>
                      </Link>
                    </div>
                  </div>
                )}
              </li>

              {/* 4. SẢN PHẨM & MODULES */}
              <li
                className="nav-item has-dropdown"
                onMouseEnter={() => handleMouseEnter('products')}
              >
                <button
                  type="button"
                  className={`nav-link nav-btn-trigger ${activeDropdown === 'products' ? 'active' : ''}`}
                  aria-expanded={activeDropdown === 'products'}
                  onClick={() => setActiveDropdown(activeDropdown === 'products' ? null : 'products')}
                >
                  <span>Sản phẩm</span>
                  <svg
                    className={`nav-chevron ${activeDropdown === 'products' ? 'open' : ''}`}
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

                {activeDropdown === 'products' && (
                  <div
                    className="nav-mega-dropdown mega-standard-layout"
                    onMouseEnter={() => handleMouseEnter('products')}
                    role="menu"
                  >
                    <div className="dropdown-grid">
                      <Link href="/products/order-automation" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <div className="item-title-row">
                            <IconOrderAutomation size={16} color="var(--text-primary)" />
                            <span className="item-title">Xử lý Đơn hàng (Order Automation)</span>
                          </div>
                          <span className="item-badge">Tiêu biểu</span>
                        </div>
                        <p className="item-desc">Module bóc tách và đối soát đơn hàng hội thoại với Rules Engine và nguồn sự thật chuẩn.</p>
                      </Link>

                      <Link href="/products/knowledge" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <div className="item-title-row">
                            <IconKnowledgeTruth size={16} color="var(--text-primary)" />
                            <span className="item-title">Tri thức Doanh nghiệp (Knowledge Engine)</span>
                          </div>
                        </div>
                        <p className="item-desc">Hợp nhất cẩm nang sản phẩm, bảng giá và quy trình nội bộ dùng chung cho toàn bộ phòng ban.</p>
                      </Link>

                      <Link href="/products/campaigns" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <div className="item-title-row">
                            <IconCampaign size={16} color="var(--text-primary)" />
                            <span className="item-title">Điều phối Chiến dịch (Campaigns)</span>
                          </div>
                        </div>
                        <p className="item-desc">Lên lịch và gửi thông báo, chính sách mới theo hàng đợi giãn cách an toàn chống nghẽn kênh.</p>
                      </Link>
                    </div>
                  </div>
                )}
              </li>

              {/* 5. TÀI NGUYÊN */}
              <li
                className="nav-item has-dropdown"
                onMouseEnter={() => handleMouseEnter('resources')}
              >
                <button
                  type="button"
                  className={`nav-link nav-btn-trigger ${activeDropdown === 'resources' ? 'active' : ''}`}
                  aria-expanded={activeDropdown === 'resources'}
                  onClick={() => setActiveDropdown(activeDropdown === 'resources' ? null : 'resources')}
                >
                  <span>Tài nguyên</span>
                  <svg
                    className={`nav-chevron ${activeDropdown === 'resources' ? 'open' : ''}`}
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

                {activeDropdown === 'resources' && (
                  <div
                    className="nav-mega-dropdown mega-standard-layout"
                    onMouseEnter={() => handleMouseEnter('resources')}
                    role="menu"
                  >
                    <div className="dropdown-grid">
                      <Link href="/resources/faq" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <span className="item-title">Câu hỏi Thường gặp (FAQ)</span>
                        </div>
                        <p className="item-desc">Giải đáp mọi thắc mắc về năng lực, lộ trình triển khai và an toàn dữ liệu doanh nghiệp.</p>
                      </Link>

                      <Link href="/resources/roadmap" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <span className="item-title">Lộ trình Phát triển (Roadmap)</span>
                        </div>
                        <p className="item-desc">Định hướng mở rộng hệ sinh thái các module vận hành của nexagnet.</p>
                      </Link>

                      <Link href="/privacy" className="dropdown-item-card" role="menuitem" onClick={() => setActiveDropdown(null)}>
                        <div className="item-header">
                          <span className="item-title">Chính sách Bảo mật Dữ liệu</span>
                        </div>
                        <p className="item-desc">Tuân thủ Luật 91/2025/QH15 &amp; Nghị định 356/2025 về bảo vệ dữ liệu cá nhân.</p>
                      </Link>
                    </div>
                  </div>
                )}
              </li>
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

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-menu-dropdown" role="dialog" aria-modal="true">
            <nav aria-label="Điều hướng trên thiết bị di động">
              <div className="mobile-accordion-list">
                {/* Mobile Group 1: Phòng ban */}
                <div className="mobile-accordion-group">
                  <button
                    type="button"
                    className="mobile-cat-header"
                    onClick={() => setMobileExpandedCat(mobileExpandedCat === 'departments' ? null : 'departments')}
                    aria-expanded={mobileExpandedCat === 'departments'}
                  >
                    <span>Quản trị Phòng ban (7)</span>
                    <span className="mobile-chevron">{mobileExpandedCat === 'departments' ? '−' : '+'}</span>
                  </button>

                  {mobileExpandedCat === 'departments' && (
                    <div className="mobile-sub-list">
                      <Link href="/departments/executive" className="mobile-sub-link highlight-mobile" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">★ Ban Giám đốc (Executive)</span>
                        <span className="sub-desc">Dành cho Chủ Doanh nghiệp quản lý toàn diện</span>
                      </Link>
                      <Link href="/departments/sales" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Phòng Bán hàng (Sales)</span>
                      </Link>
                      <Link href="/departments/operations" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Phòng Vận hành (Operations)</span>
                      </Link>
                      <Link href="/departments/customer-service" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Chăm sóc Khách hàng (CSKH)</span>
                      </Link>
                      <Link href="/departments/finance" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Tài chính &amp; Kế toán (Finance)</span>
                      </Link>
                      <Link href="/departments/marketing" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Phòng Tiếp thị (Marketing)</span>
                      </Link>
                      <Link href="/departments/hr" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Nhân sự &amp; Nội bộ (HR)</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Mobile Group 2: Ngành */}
                <div className="mobile-accordion-group">
                  <button
                    type="button"
                    className="mobile-cat-header"
                    onClick={() => setMobileExpandedCat(mobileExpandedCat === 'industries' ? null : 'industries')}
                    aria-expanded={mobileExpandedCat === 'industries'}
                  >
                    <span>Giải pháp 12 Ngành nghề</span>
                    <span className="mobile-chevron">{mobileExpandedCat === 'industries' ? '−' : '+'}</span>
                  </button>

                  {mobileExpandedCat === 'industries' && (
                    <div className="mobile-sub-list">
                      <Link href="/industries/retail-distribution" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Bán lẻ &amp; Phân phối (B2B)</span>
                      </Link>
                      <Link href="/industries/manufacturing" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Sản xuất &amp; Gia công</span>
                      </Link>
                      <Link href="/industries/logistics" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Vận tải &amp; Logistics</span>
                      </Link>
                      <Link href="/industries/healthcare-clinic" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Y tế &amp; Phòng khám</span>
                      </Link>
                      <Link href="/industries/spa-beauty" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Spa &amp; Thẩm mỹ</span>
                      </Link>
                      <Link href="/industries/fnb-chains" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Chuỗi Nhà hàng (F&B)</span>
                      </Link>
                      <Link href="/industries/financial-services" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Tài chính &amp; Bảo hiểm</span>
                      </Link>
                      <Link href="/industries/construction-interior" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Xây dựng &amp; Nội thất</span>
                      </Link>
                      <Link href="/industries/real-estate" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Bất động sản &amp; Sàn GD</span>
                      </Link>
                      <Link href="/industries/professional-services" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Luật &amp; Tư vấn DN</span>
                      </Link>
                      <Link href="/industries/education" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Giáo dục &amp; Tuyển sinh</span>
                      </Link>
                      <Link href="/industries/hospitality" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Khách sạn &amp; Dịch vụ</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Mobile Group 3: Nền tảng */}
                <div className="mobile-accordion-group">
                  <button
                    type="button"
                    className="mobile-cat-header"
                    onClick={() => setMobileExpandedCat(mobileExpandedCat === 'platform' ? null : 'platform')}
                    aria-expanded={mobileExpandedCat === 'platform'}
                  >
                    <span>Nền tảng &amp; Kiểm soát</span>
                    <span className="mobile-chevron">{mobileExpandedCat === 'platform' ? '−' : '+'}</span>
                  </button>

                  {mobileExpandedCat === 'platform' && (
                    <div className="mobile-sub-list">
                      <Link href="/platform" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Tổng quan Nền tảng</span>
                      </Link>
                      <Link href="/platform/control" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Kiểm soát &amp; Quản trị (Rules Engine)</span>
                      </Link>
                      <Link href="/platform/integrations" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Hạ tầng Tích hợp</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Mobile Group 4: Sản phẩm */}
                <div className="mobile-accordion-group">
                  <button
                    type="button"
                    className="mobile-cat-header"
                    onClick={() => setMobileExpandedCat(mobileExpandedCat === 'products' ? null : 'products')}
                    aria-expanded={mobileExpandedCat === 'products'}
                  >
                    <span>Sản phẩm &amp; Module</span>
                    <span className="mobile-chevron">{mobileExpandedCat === 'products' ? '−' : '+'}</span>
                  </button>

                  {mobileExpandedCat === 'products' && (
                    <div className="mobile-sub-list">
                      <Link href="/products/order-automation" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Xử lý Đơn hàng (Order Automation)</span>
                      </Link>
                      <Link href="/products/knowledge" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Tri thức Doanh nghiệp (Knowledge)</span>
                      </Link>
                      <Link href="/products/campaigns" className="mobile-sub-link" onClick={() => setMobileMenuOpen(false)}>
                        <span className="sub-title">Điều phối Chiến dịch (Campaigns)</span>
                      </Link>
                    </div>
                  )}
                </div>
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
