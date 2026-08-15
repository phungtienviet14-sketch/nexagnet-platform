'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Nền tảng', href: '#platform' },
    { label: 'Quy trình', href: '#modules' },
    { label: 'Giải pháp', href: '#solutions' },
    { label: 'Bảo mật', href: '#security' },
    { label: 'Tài nguyên', href: '#resources' },
  ];

  return (
    <header
      className={`navbar-root ${isScrolled ? 'navbar-scrolled' : ''}`}
      role="banner"
    >
      <div className="container">
        <div className="navbar-inner">
          {/* Brand Wordmark */}
          <Link href="/" className="brand-link" aria-label="nexagnet homepage">
            <span className="brand-motif" aria-hidden="true">
              <span className="brand-dot" />
            </span>
            <span className="brand-wordmark">nexagnet</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="desktop-nav" aria-label="Main Navigation">
            <ul className="nav-list">
              {navLinks.map((item) => (
                <li key={item.label} className="nav-item">
                  <Link href={item.href} className="nav-link">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Right Action CTA */}
          <div className="navbar-actions">
            <Link href="#demo" className="btn-primary btn-demo-nav">
              <span>Yêu cầu Demo</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M6 3.5L10.5 8L6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              <span className={`hamburger-bar ${mobileMenuOpen ? 'open-top' : ''}`} />
              <span className={`hamburger-bar ${mobileMenuOpen ? 'open-mid' : ''}`} />
              <span className={`hamburger-bar ${mobileMenuOpen ? 'open-bot' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="mobile-menu-dropdown" role="dialog" aria-modal="true">
            <nav aria-label="Mobile Navigation">
              <ul className="mobile-nav-list">
                {navLinks.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="mobile-nav-link"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mobile-nav-cta">
                <Link
                  href="#demo"
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>Yêu cầu Demo</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 3.5L10.5 8L6 12.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
