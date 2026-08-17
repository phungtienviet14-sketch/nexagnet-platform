'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  IconRetail,
  IconSpa,
  IconRealEstate,
  IconEducation,
  IconHospitality,
  IconHealthcare,
  IconManufacturing,
  IconLogistics,
  IconFinancialServices,
  IconConstruction,
  IconFnB,
  IconProfessionalServices,
} from '@/components/shared/EnterpriseIcons';

interface IndustryTeaserItem {
  slug: string;
  name: string;
  code: string;
  category: 'b2b-distribution' | 'services-clinic' | 'operations-project';
  Icon: React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;
  coreProblem: string;
  solution: string;
  href: string;
}

const TEASER_INDUSTRIES: IndustryTeaserItem[] = [
  {
    slug: 'retail-distribution',
    name: 'Bán lẻ & Phân phối (B2B)',
    code: 'RETAIL & DISTRIBUTION',
    category: 'b2b-distribution',
    Icon: IconRetail,
    coreProblem: 'Hàng trăm nhóm Zalo dồn đơn cao điểm, tin nhắn viết tắt và đối soát công nợ phức tạp.',
    solution: 'Bóc tách đơn hàng theo bảng giá đại lý, kiểm tra hạn mức nợ và chuyển sang vận hành tức thì.',
    href: '/industries/retail-distribution',
  },
  {
    slug: 'manufacturing',
    name: 'Sản xuất, Gia công & FMCG',
    code: 'MANUFACTURING & FMCG',
    category: 'b2b-distribution',
    Icon: IconManufacturing,
    coreProblem: 'Đơn đặt hàng nhiều mã quy cách vật tư, chuyển giao qua chat rời rạc gây sai hỏng sản xuất.',
    solution: 'Bóc tách thông số kỹ thuật, đối soát định mức vật tư và tự động tạo Lệnh sản xuất cho xưởng.',
    href: '/industries/manufacturing',
  },
  {
    slug: 'logistics',
    name: 'Vận tải, Kho bãi & Logistics',
    code: 'LOGISTICS & FREIGHT',
    category: 'b2b-distribution',
    Icon: IconLogistics,
    coreProblem: 'Báo giá cước đa tuyến đường thủ công và sự cố chậm hàng không được thông báo kịp thời.',
    solution: 'Đọc hiểu vận đơn, tính cước tất định theo bảng giá và thu thập chứng từ POD qua chat.',
    href: '/industries/logistics',
  },
  {
    slug: 'healthcare-clinic',
    name: 'Y tế, Phòng khám & Nha khoa',
    code: 'HEALTHCARE & CLINIC',
    category: 'services-clinic',
    Icon: IconHealthcare,
    coreProblem: 'Lịch khám đa bác sĩ bị chồng chéo, bệnh nhân hỏi ngoài giờ và trôi lịch nhắc tái khám.',
    solution: 'Phân loại nhu cầu theo chuyên khoa, tiếp nhận đặt lịch 24/7 và gửi thông báo nhắc tái khám.',
    href: '/industries/healthcare-clinic',
  },
  {
    slug: 'spa-beauty',
    name: 'Spa, Thẩm mỹ & Sức khỏe',
    code: 'BEAUTY & CLINIC',
    category: 'services-clinic',
    Icon: IconSpa,
    coreProblem: 'Tư vấn liệu trình không đồng nhất giữa các cơ sở, thất lạc khách hàng ngoài giờ làm việc.',
    solution: 'Tư vấn cẩm nang dịch vụ 24/7 theo giá duyệt, tiếp nhận lịch hẹn và chuyển giao Lễ tân.',
    href: '/industries/spa-beauty',
  },
  {
    slug: 'fnb-chains',
    name: 'Chuỗi Nhà hàng & F&B',
    code: 'F&B & RESTAURANT',
    category: 'services-clinic',
    Icon: IconFnB,
    coreProblem: 'Dồn đơn đặt bàn tiệc giờ cao điểm, các cơ sở gửi đơn đặt nguyên liệu về Bếp trung tâm lộn xộn.',
    solution: 'Tiếp nhận đặt bàn đa kênh kèm cọc chuẩn, gom bảng kê vật tư tự động cho Bếp trung tâm.',
    href: '/industries/fnb-chains',
  },
  {
    slug: 'financial-services',
    name: 'Tài chính, Bảo hiểm & Thẩm định',
    code: 'FINANCIAL & INSURANCE',
    category: 'operations-project',
    Icon: IconFinancialServices,
    coreProblem: 'Hồ sơ bồi thường bị thiếu chứng từ, kiểm tra thủ công điều khoản hợp đồng tốn nhiều ngày.',
    solution: 'Tiếp nhận hồ sơ đa kênh, kiểm tra tính hợp lệ chứng từ và hỗ trợ chuyên viên thẩm định duyệt nhanh.',
    href: '/industries/financial-services',
  },
  {
    slug: 'construction-interior',
    name: 'Xây dựng, Nội thất & Vật tư',
    code: 'CONSTRUCTION & INTERIOR',
    category: 'operations-project',
    Icon: IconConstruction,
    coreProblem: 'Bóc tách dự toán sơ bộ tốn nhiều ngày, phát sinh vật tư ngoài công trường không kiểm soát.',
    solution: 'Bóc tách dự toán sơ bộ tức thì theo đơn giá chuẩn, cảnh báo vượt định mức và theo dõi nghiệm thu.',
    href: '/industries/construction-interior',
  },
  {
    slug: 'real-estate',
    name: 'Bất động sản & Sàn Phân phối',
    code: 'REAL ESTATE',
    category: 'operations-project',
    Icon: IconRealEstate,
    coreProblem: 'Lead đa kênh đổ về dồn dập, môi giới tốn thời gian lọc nhu cầu và tra cứu tài liệu dự án.',
    solution: 'Sàng lọc nhu cầu và ngân sách, gửi tài liệu chính thống và bàn giao lead cho môi giới chuyên trách.',
    href: '/industries/real-estate',
  },
  {
    slug: 'professional-services',
    name: 'Luật, Thuế & Tư vấn Doanh nghiệp',
    code: 'LEGAL & CONSULTING',
    category: 'operations-project',
    Icon: IconProfessionalServices,
    coreProblem: 'Chuyên viên mất nhiều thời gian trả lời câu hỏi thủ tục cơ bản, thu thập hồ sơ ban đầu rời rạc.',
    solution: 'Cung cấp biểu phí và thủ tục niêm yết, gom đủ hồ sơ đầu vào trước khi phân công luật sư.',
    href: '/industries/professional-services',
  },
  {
    slug: 'education',
    name: 'Giáo dục & Tuyển sinh',
    code: 'EDUCATION & ADMISSIONS',
    category: 'services-clinic',
    Icon: IconEducation,
    coreProblem: 'Áp lực tuyển sinh cao điểm, học phí và lịch khai giảng thay đổi liên tục gây sai lệch thông tin.',
    solution: 'Tư vấn chương trình và học phí niêm yết, tiếp nhận đăng ký thi thử và xếp lịch tư vấn 1-1.',
    href: '/industries/education',
  },
  {
    slug: 'hospitality',
    name: 'Khách sạn & Dịch vụ',
    code: 'HOSPITALITY',
    category: 'services-clinic',
    Icon: IconHospitality,
    coreProblem: 'Yêu cầu phòng ốc đến từ nhiều kênh, chuyển việc thủ công giữa Lễ tân, Buồng phòng và F&B.',
    solution: 'Tiếp nhận yêu cầu dịch vụ đa kênh và phân luồng tác vụ tự động đến đúng ca trực phụ trách.',
    href: '/industries/hospitality',
  },
];

export function HomeIndustriesTeaser() {
  const [activeFilter, setActiveFilter] = useState<'all' | 'b2b-distribution' | 'services-clinic' | 'operations-project'>('all');

  const filteredIndustries = activeFilter === 'all' 
    ? TEASER_INDUSTRIES 
    : TEASER_INDUSTRIES.filter(item => item.category === activeFilter);

  return (
    <section className="home-industries-section" id="industries" aria-label="Giải pháp theo ngành">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span className="mono-label">GIẢI PHÁP THEO 12 MÔ HÌNH DOANH NGHIỆP</span>
          </div>

          <h2 className="section-headline">
            Mỗi ngành có những nút thắt vận hành riêng biệt.
          </h2>

          <p className="section-subheadline">
            Nexagnet không cung cấp các chatbot trả lời chung chung. Hệ thống cấu hình Rules Engine và Knowledge Base chuyên sâu để xử lý chính xác các bài toán nhức nhối theo từng ngành.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="industries-filter-row" role="tablist" aria-label="Bộ lọc mô hình ngành">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'all'}
            className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            Tất cả 12 ngành ({TEASER_INDUSTRIES.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'b2b-distribution'}
            className={`filter-pill ${activeFilter === 'b2b-distribution' ? 'active' : ''}`}
            onClick={() => setActiveFilter('b2b-distribution')}
          >
            Phân phối, Sản xuất & Vận tải
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'services-clinic'}
            className={`filter-pill ${activeFilter === 'services-clinic' ? 'active' : ''}`}
            onClick={() => setActiveFilter('services-clinic')}
          >
            Y tế, Dịch vụ & F&B
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'operations-project'}
            className={`filter-pill ${activeFilter === 'operations-project' ? 'active' : ''}`}
            onClick={() => setActiveFilter('operations-project')}
          >
            Tài chính, Bất động sản & Xây dựng
          </button>
        </div>

        {/* Industry Cards Grid */}
        <div className="industries-teaser-grid">
          {filteredIndustries.map((ind) => {
            const { Icon } = ind;
            return (
              <Link key={ind.slug} href={ind.href} className="industry-teaser-card">
                <div className="card-header-row">
                  <div className="ind-icon-box">
                    <Icon size={20} color="var(--text-primary)" />
                  </div>
                  <span className="view-link-badge">
                    <span>Xem giải pháp</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>

                <div className="ind-meta-tag">{ind.code}</div>
                <h3 className="ind-title">{ind.name}</h3>

                <div className="ind-problem-box">
                  <span className="box-label">Nút thắt vận hành:</span>
                  <p className="box-text">{ind.coreProblem}</p>
                </div>

                <div className="ind-solution-box">
                  <span className="box-label">Cách Nexagnet giải quyết:</span>
                  <p className="box-text">{ind.solution}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
