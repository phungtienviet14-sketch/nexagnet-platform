'use client';

import React from 'react';
import { NexagnetIcon } from '@/components/shared/EnterpriseIcons';

export interface FeatureItem {
  icon?: string | React.ReactNode;
  title: string;
  desc: string;
  bullets?: string[];
  badge?: string;
}

interface FeatureGridProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  features: FeatureItem[];
  columns?: 2 | 3 | 4;
}

export function FeatureGrid({
  eyebrow = 'NĂNG LỰC CỐT LÕI',
  title,
  subtitle,
  features,
  columns = 3,
}: FeatureGridProps) {
  return (
    <section className="feature-grid-section" aria-label="Năng lực cốt lõi">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
          </div>

          <h2 className="section-headline">{title}</h2>

          <p className="section-subheadline">{subtitle}</p>
        </div>

        <div className={`features-cards-grid cols-${columns}`}>
          {features.map((feat, idx) => (
            <div key={idx} className="feature-card">
              <div className="feat-header">
                <div className="feat-icon-wrap">
                  {typeof feat.icon === 'string' ? (
                    <NexagnetIcon name={feat.icon} size={22} containerStyle="subtle" />
                  ) : feat.icon ? (
                    feat.icon
                  ) : (
                    <NexagnetIcon name="rules" size={22} containerStyle="subtle" />
                  )}
                </div>
                {feat.badge && <span className="feat-badge">{feat.badge}</span>}
              </div>

              <h3 className="feat-title">{feat.title}</h3>
              <p className="feat-desc">{feat.desc}</p>

              {feat.bullets && feat.bullets.length > 0 && (
                <div className="feat-bullets-list">
                  {feat.bullets.map((b, bIdx) => (
                    <div key={bIdx} className="feat-bullet-line">
                      <span className="b-check" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13.3 4.3L6 11.6 2.7 8.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
