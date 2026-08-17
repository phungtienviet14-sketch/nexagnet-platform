'use client';

import Link from 'next/link';
import { ExecutiveControlPreview } from './ExecutiveControlPreview';
import {
  IconAIProcessor,
  IconOperations,
  IconHumanGate,
  IconExecutive,
} from '@/components/shared/EnterpriseIcons';

export function HomeOwnerView() {
  return (
    <section className="home-owner-view-section dark-obsidian-theme" aria-label="Góc nhìn điều hành cho chủ doanh nghiệp">
      <div className="container">
        {/* Section Header */}
        <div className="section-header section-header-light">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span className="mono-label">GÓC NHÌN ĐIỀU HÀNH DOANH NGHIỆP</span>
          </div>

          <h2 className="section-headline">
            Không chỉ tự động hóa.
            <br />
            Hãy biết doanh nghiệp đang vận hành như thế nào.
          </h2>

          <p className="section-subheadline">
            Nexagnet giúp người quản lý thoát khỏi tình trạng phải hỏi từng nhân viên để biết tiến độ. Toàn bộ trạng thái luồng công việc được gom tập trung và chỉ đưa những việc thực sự cần can thiệp tới cấp quản lý.
          </p>
        </div>

        {/* 4 Executive Value Props */}
        <div className="owner-value-props-row">
          <div className="owner-prop-card">
            <div className="prop-icon-box">
              <IconAIProcessor size={20} color="var(--brand-accent)" />
            </div>
            <h3 className="prop-title">Lọc nhiễu vận hành</h3>
            <p className="prop-desc">Hàng trăm tương tác lặp lại được AI và Rules xử lý tự động; chỉ có ngoại lệ mới chuyển lên.</p>
          </div>

          <div className="owner-prop-card">
            <div className="prop-icon-box">
              <IconOperations size={20} color="#F59E0B" />
            </div>
            <h3 className="prop-title">Phát hiện điểm nghẽn</h3>
            <p className="prop-desc">Biết chính xác quy trình nào đang bị chậm, phòng ban nào có việc tồn để xử lý kịp thời.</p>
          </div>

          <div className="owner-prop-card">
            <div className="prop-icon-box">
              <IconHumanGate size={20} color="#10B981" />
            </div>
            <h3 className="prop-title">Kiểm soát ngoại lệ</h3>
            <p className="prop-desc">Mọi đề xuất chiết khấu lớn, vượt hạn mức nợ hay xử lý đặc biệt đều có người có thẩm quyền ký duyệt.</p>
          </div>

          <div className="owner-prop-card">
            <div className="prop-icon-box">
              <IconExecutive size={20} color="#6366F1" />
            </div>
            <h3 className="prop-title">Mở rộng có kiểm soát</h3>
            <p className="prop-desc">Tự tin mở rộng quy mô kinh doanh mà không sợ mất kiểm soát chất lượng hay quy tắc doanh nghiệp.</p>
          </div>
        </div>

        {/* Signature Visual: Operations Control Center Preview */}
        <div className="owner-visual-container">
          <ExecutiveControlPreview />
        </div>

        <div className="owner-cta-bar">
          <Link href="/departments/executive" className="btn-secondary dark-theme-btn">
            <span>Khám phá chi tiết giải pháp cho Ban Giám đốc</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
