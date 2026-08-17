'use client';

import React from 'react';
import Link from 'next/link';
import { INDUSTRIES_DATA } from '../data/industries';

export function IndustrySolutionsGrid() {
  return (
    <div className="solutions-grid">
      {INDUSTRIES_DATA.map((ind) => (
        <div key={ind.slug} className="solution-card">
          <span className="card-icon">{ind.icon}</span>
          <h3>{ind.title}</h3>
          <p>{ind.subtitle}</p>
          <Link href={`/industries/${ind.slug}`}>Xem chi tiết →</Link>
        </div>
      ))}
    </div>
  );
}
