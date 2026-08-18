'use client';

import React from 'react';

/**
 * 1. Retail & Distribution B2B Visual
 */
export function RetailDistributionVisual() {
  return (
    <div className="industry-artifact-card retail-artifact" aria-label="Bảng bóc tách đơn Bán lẻ & Phân phối">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">ZALO B2B INGEST &amp; SKU MATCH</span>
        </div>
        <span className="artifact-tag brand">BÁN LẺ &amp; PHÂN PHỐI</span>
      </div>

      <div className="artifact-body">
        <div className="raw-msg-box">
          <div className="msg-source">📱 Nhóm Zalo [Đại lý Miền Bắc #14]:</div>
          <div className="msg-text">“Chị lấy 15 cái quạt felix + 5 màng lọc ocp gửi về kho TN nhé”</div>
        </div>

        <div className="parsed-sku-table">
          <div className="table-header">
            <span>MÃ SKU</span>
            <span>SL</span>
            <span>ĐƠN GIÁ CẤP 1</span>
            <span>THÀNH TIỀN</span>
          </div>
          <div className="table-row">
            <span className="sku-code">FLX-01 (Quạt Felix)</span>
            <span className="sku-qty">15</span>
            <span className="sku-price">1.150.000đ</span>
            <span className="sku-total">17.250.000đ</span>
          </div>
          <div className="table-row">
            <span className="sku-code">OCP-FLT (Lọc OCP)</span>
            <span className="sku-qty">5</span>
            <span className="sku-price">450.000đ</span>
            <span className="sku-total">2.250.000đ</span>
          </div>
        </div>

        <div className="rule-validation-status">
          <div className="val-item pass">
            <span className="val-icon">✓</span>
            <span>Hạn mức công nợ: <strong>Còn 30.500.000đ</strong> (Hợp lệ)</span>
          </div>
          <div className="val-item pass">
            <span className="val-icon">✓</span>
            <span>Địa chỉ giao: <strong>Kho Thái Nguyên</strong> (Đã map)</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>⚡ Tự động xuất phiếu kho trong 3s</span>
        <span>🛡️ Khớp 100% biểu giá đại lý</span>
      </div>
    </div>
  );
}

/**
 * 2. Spa & Beauty Aesthetics Visual
 */
export function SpaBeautyVisual() {
  return (
    <div className="industry-artifact-card spa-artifact" aria-label="Bảng điều phối Lịch hẹn Spa & Thẩm mỹ">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">APPOINTMENT &amp; THERAPIST BOARD</span>
        </div>
        <span className="artifact-tag teal">SPA &amp; THẨM MỸ</span>
      </div>

      <div className="artifact-body">
        <div className="spa-booking-card">
          <div className="booking-top">
            <span className="cust-name">Khách: Chị Minh Thảo (Hội viên Diamond)</span>
            <span className="booking-status confirmed">ĐÃ KHÓA GIỜ</span>
          </div>
          <div className="service-row">
            <span className="serv-icon">✨</span>
            <span className="serv-name">Trị liệu Nâng cơ Laser Hifu Ultra</span>
            <span className="serv-time">14:30 - 16:00 (Hôm nay)</span>
          </div>
        </div>

        <div className="therapist-allocation-grid">
          <div className="alloc-box">
            <span className="alloc-label">BÁC SĨ PHỤ TRÁCH</span>
            <span className="alloc-name">BS. Hoàng Mai (Phòng VIP 02)</span>
          </div>
          <div className="alloc-box">
            <span className="alloc-label">KỸ THUẬT VIÊN</span>
            <span className="alloc-name">KTV. Thu Trang (Chuẩn bị máy)</span>
          </div>
        </div>

        <div className="spa-auto-reminder">
          <span className="remind-icon">🔔</span>
          <span className="remind-text">Đã tự động gửi Zalo ZNS nhắc hẹn kèm hướng dẫn chăm sóc da trước trị liệu</span>
        </div>
      </div>

      <div className="artifact-footer">
        <span>⏱️ Không trùng lịch phòng điều trị</span>
        <span>💆 Tối ưu 100% công suất KTV</span>
      </div>
    </div>
  );
}

/**
 * 3. Real Estate Visual
 */
export function RealEstateVisual() {
  return (
    <div className="industry-artifact-card realestate-artifact" aria-label="Bảng khóa giỏ hàng Bất động sản">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">PROJECT INVENTORY &amp; BROKER GATE</span>
        </div>
        <span className="artifact-tag amber">BẤT ĐỘNG SẢN</span>
      </div>

      <div className="artifact-body">
        <div className="project-unit-card">
          <div className="unit-header">
            <span className="unit-code">CĂN HỘ A12-08 · SUNSHINE OASIS</span>
            <span className="lock-pill active">🔒 TẠM KHÓA CĂN: 14:48s</span>
          </div>
          <div className="unit-details">
            <span>Diện tích: 78.5 m² (2PN - 2WC)</span>
            <span>Hướng: Đông Nam · View Hồ</span>
            <span className="price-tag">3.450.000.000đ</span>
          </div>
        </div>

        <div className="broker-routing-box">
          <div className="route-row">
            <span className="route-lbl">MÔI GIỚI XÁC NHẬN:</span>
            <span className="route-val">Nguyễn Văn Bình (Sàn Đất Xanh)</span>
          </div>
          <div className="route-row">
            <span className="route-lbl">CHÍNH SÁCH HOA HỒNG:</span>
            <span className="route-val">2.5% (Chiết khấu mở bán đợt 1)</span>
          </div>
          <div className="route-row">
            <span className="route-lbl">TRẠNG THÁI TIỀN CỌC:</span>
            <span className="route-val text-success">Đã đối soát 50.000.000đ qua Techcombank</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>⚡ Tránh 100% rủi ro bán trùng căn</span>
        <span>📊 Minh bạch bảng hàng cho 500 môi giới</span>
      </div>
    </div>
  );
}

/**
 * 4. F&B Chains Visual
 */
export function FnbChainsVisual() {
  return (
    <div className="industry-artifact-card fnb-artifact" aria-label="Bảng điều phối Chuỗi F&B">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">CENTRAL KITCHEN &amp; STORE REQUISITION</span>
        </div>
        <span className="artifact-tag orange">CHUỖI F&amp;B</span>
      </div>

      <div className="artifact-body">
        <div className="store-req-row">
          <div className="store-badge">CHI NHÁNH #08 (CẦU GIẤY)</div>
          <div className="req-time">Lệnh nhập hàng ca sáng: 05:30 AM</div>
        </div>

        <div className="bom-items-grid">
          <div className="bom-item">
            <span className="bom-name">Cốt phở bò đặc biệt</span>
            <span className="bom-qty">50 Lít</span>
            <span className="bom-status pass">✓ Đủ nguyên liệu</span>
          </div>
          <div className="bom-item">
            <span className="bom-name">Bánh phở tươi cắt sẵn</span>
            <span className="bom-qty">80 Kg</span>
            <span className="bom-status pass">✓ Xuất từ xưởng</span>
          </div>
          <div className="bom-item">
            <span className="bom-name">Thịt bò Úc phi lê</span>
            <span className="bom-qty">25 Kg</span>
            <span className="bom-status pass">✓ Kiểm định ATTP</span>
          </div>
        </div>

        <div className="fnb-routing-alert">
          <span>🚚 Xe giao hàng số 02 đang trên lộ trình giao (Dự kiến đến: 06:15 AM)</span>
        </div>
      </div>

      <div className="artifact-footer">
        <span>🥗 Giảm 80% lãng phí hao hụt</span>
        <span>⏱️ Đồng bộ 20 chi nhánh trước giờ mở cửa</span>
      </div>
    </div>
  );
}

/**
 * 5. Healthcare & Clinic Visual
 */
export function HealthcareClinicVisual() {
  return (
    <div className="industry-artifact-card health-artifact" aria-label="Bảng tiếp nhận Phòng khám & Y tế">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">MEDICAL TRIAGE &amp; SPECIALIST DISPATCH</span>
        </div>
        <span className="artifact-tag blue">PHÒNG KHÁM &amp; Y TẾ</span>
      </div>

      <div className="artifact-body">
        <div className="triage-inquiry">
          <div className="triage-top">
            <span className="patient-tag">Bệnh nhân: Lê Quốc Tuấn (42 tuổi)</span>
            <span className="triage-lvl urgent">MỨC ĐỘ 2 · ƯU TIÊN</span>
          </div>
          <p className="symptom-text">“Đau nhói ngực trái lan ra sau lưng khi vận động mạnh kèm khó thở...”</p>
        </div>

        <div className="specialist-box">
          <div className="spec-item">
            <span className="spec-title">CHUYÊN KHOA PHÂN ĐỊNH:</span>
            <span className="spec-name">Khoa Tim Mạch Can Thiệp</span>
          </div>
          <div className="spec-item">
            <span className="spec-title">BÁC SĨ TRỰC:</span>
            <span className="spec-name">TS.BS. Trần Đăng Khoa (Phòng 301)</span>
          </div>
        </div>

        <div className="health-compliance-note">
          <span>🔒 Mã hóa hồ sơ bệnh án theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15</span>
        </div>
      </div>

      <div className="artifact-footer">
        <span>🏥 Không bỏ sót ca cấp cứu</span>
        <span>⏱️ Sắp xếp đúng bác sĩ trong 10s</span>
      </div>
    </div>
  );
}

/**
 * 6. Hospitality & Resorts Visual
 */
export function HospitalityVisual() {
  return (
    <div className="industry-artifact-card hospital-artifact" aria-label="Bảng điều phối Khách sạn & Nghỉ dưỡng">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">GUEST PREFERENCE &amp; SERVICE ROUTING</span>
        </div>
        <span className="artifact-tag indigo">KHÁCH SẠN &amp; RESORT</span>
      </div>

      <div className="artifact-body">
        <div className="guest-profile-card">
          <div className="guest-top">
            <span className="guest-badge vip">VIP GUEST · PHÒNG PENTHOUSE 1802</span>
            <span className="stay-duration">Lưu trú: 3 đêm</span>
          </div>
          <div className="guest-pref-list">
            <span>⭐ Sở thích: Gối lông vũ không dị ứng · Nước khoáng có ga</span>
            <span>🍽️ Chế độ ăn: Dị ứng hải sản vỏ cứng</span>
          </div>
        </div>

        <div className="service-dispatch-grid">
          <div className="serv-box">
            <span className="serv-dept">BUỒNG PHÒNG:</span>
            <span className="serv-action">Set up phòng nhiệt độ 22°C lúc 14:00</span>
          </div>
          <div className="serv-box">
            <span className="serv-dept">LỄ TÂN:</span>
            <span className="serv-action">Check-in riêng tại sảnh VIP</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>⭐ Đánh giá hài lòng: 4.98/5</span>
        <span>🛎️ Tự động điều phối liên phòng ban</span>
      </div>
    </div>
  );
}

/**
 * 7. Education & Training Visual
 */
export function EducationVisual() {
  return (
    <div className="industry-artifact-card edu-artifact" aria-label="Bảng tuyển sinh Giáo dục">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">STUDENT ENROLLMENT &amp; COUNSELOR GATE</span>
        </div>
        <span className="artifact-tag purple">GIÁO DỤC &amp; ĐÀO TẠO</span>
      </div>

      <div className="artifact-body">
        <div className="student-lead-card">
          <div className="lead-header">
            <span className="student-name">Học viên: Hoàng Gia Bảo (Lớp 11)</span>
            <span className="intent-badge">MỤC TIÊU: IELTS 7.5</span>
          </div>
          <div className="lead-meta">
            <span>Trình độ hiện tại: 5.5 · Khung giờ học: Tối 2-4-6</span>
          </div>
        </div>

        <div className="counselor-assignment">
          <div className="assign-row">
            <span className="assign-lbl">TƯ VẤN VIÊN PHÂN BỔ:</span>
            <span className="assign-val">Cô Lê Thu Hà (Phụ trách khối THPT)</span>
          </div>
          <div className="assign-row">
            <span className="assign-lbl">HỌC BỔNG ĐƯỢC ÁP DỤNG:</span>
            <span className="assign-val text-success">Giảm 15% gói Early Bird (Hạn 25/08)</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>📚 Tăng 45% tỷ lệ chuyển đổi nhập học</span>
        <span>⚡ Tư vấn viên nhận lead trong 1 phút</span>
      </div>
    </div>
  );
}

/**
 * 8. Logistics & Supply Chain Visual
 */
export function LogisticsVisual() {
  return (
    <div className="industry-artifact-card logistics-artifact" aria-label="Bảng điều phối Vận tải & Logistics">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">WAYBILL OCR &amp; FLEET CAPACITY</span>
        </div>
        <span className="artifact-tag sky">VẬN TẢI &amp; LOGISTICS</span>
      </div>

      <div className="artifact-body">
        <div className="waybill-scan-box">
          <div className="scan-header">
            <span className="waybill-code">VẬN ĐƠN: VTL-2026-8942</span>
            <span className="status-pill moving">ĐANG VẬN CHUYỂN</span>
          </div>
          <div className="waybill-route">
            <span className="route-node">Kho Tổng Long Biên (HN)</span>
            <span className="route-line">───── 🚚 ─────</span>
            <span className="route-node">Kho Phân phối TP. Đà Nẵng</span>
          </div>
        </div>

        <div className="fleet-metrics-row">
          <div className="fleet-col">
            <span className="f-lbl">TẢI TRỌNG XE:</span>
            <span className="f-val">8.5 / 10 Tấn (85%)</span>
          </div>
          <div className="fleet-col">
            <span className="f-lbl">CAM KẾT SLA:</span>
            <span className="f-val text-success">Đúng hẹn (Giao trước 18:00)</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>📦 Tự động bóc tách ảnh vận đơn giấy</span>
        <span>🚚 Tối ưu 25% chi phí rỗng tải</span>
      </div>
    </div>
  );
}

/**
 * 9. Manufacturing & Industrial Visual
 */
export function ManufacturingVisual() {
  return (
    <div className="industry-artifact-card mfg-artifact" aria-label="Bảng điều độ Sản xuất & Nhà máy">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">WORK ORDER BOM &amp; SHIFT LOG</span>
        </div>
        <span className="artifact-tag slate">SẢN XUẤT &amp; CHẾ TẠO</span>
      </div>

      <div className="artifact-body">
        <div className="work-order-card">
          <div className="wo-header">
            <span className="wo-code">LỆNH SẢN XUẤT: WO-8840-X</span>
            <span className="wo-target">Mục tiêu: 500 Bộ Khung Kim Loại</span>
          </div>
        </div>

        <div className="bom-check-list">
          <div className="bom-row pass">
            <span>✓ Thép cuộn cán nguội CR40: 1.200 Kg (Sẵn sàng)</span>
          </div>
          <div className="bom-row pass">
            <span>✓ Sơn tĩnh điện công nghiệp Akzo: 80 Lít (Đã pha)</span>
          </div>
          <div className="bom-row pass">
            <span>✓ Dây chuyền dập khuôn tự động #03: Đang chạy ca 1</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>⚙️ Không dừng máy vì thiếu vật tư</span>
        <span>🏭 Cập nhật tiến độ ca theo thời gian thực</span>
      </div>
    </div>
  );
}

/**
 * 10. Construction & Interior Visual
 */
export function ConstructionInteriorVisual() {
  return (
    <div className="industry-artifact-card construct-artifact" aria-label="Bảng dự toán BOQ Xây dựng & Nội thất">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">BOQ SPEC &amp; SITE REQUISITION</span>
        </div>
        <span className="artifact-tag warm">XÂY DỰNG &amp; NỘI THẤT</span>
      </div>

      <div className="artifact-body">
        <div className="boq-project-header">
          <span className="proj-name">Dự án: Biệt thự Vườn Ecopark Park River</span>
          <span className="phase-badge">GIAI ĐOẠN HOÀN THIỆN NỘI THẤT</span>
        </div>

        <div className="boq-items-table">
          <div className="boq-row">
            <span>Gỗ An Cường MDF lõi xanh chống ẩm</span>
            <span className="boq-qty">120 Tấm</span>
            <span className="boq-status pass">✓ Đã duyệt mẫu</span>
          </div>
          <div className="boq-row">
            <span>Bản lề giảm chấn Hafele Inox 304</span>
            <span className="boq-qty">240 Bộ</span>
            <span className="boq-status pass">✓ Khớp mã BOQ</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>📐 Khớp 100% bản vẽ kỹ thuật</span>
        <span>🏗️ Cấp vật tư đúng tiến độ công trường</span>
      </div>
    </div>
  );
}

/**
 * 11. Financial Services & Insurance Visual
 */
export function FinancialServicesVisual() {
  return (
    <div className="industry-artifact-card fin-serv-artifact" aria-label="Cổng thẩm định Dịch vụ Tài chính">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">CREDIT POLICY &amp; KYC AUDIT GATE</span>
        </div>
        <span className="artifact-tag green">DỊCH VỤ TÀI CHÍNH</span>
      </div>

      <div className="artifact-body">
        <div className="kyc-profile-row">
          <span className="kyc-id">HỒ SƠ KHÁCH HÀNG: DN-TECH-409</span>
          <span className="kyc-status approved">✓ KYC CCCD GẮN CHIP HỢP LỆ</span>
        </div>

        <div className="credit-rules-box">
          <div className="c-rule pass">
            <span>✓ Điểm tín dụng CIC: Nhóm 1 (Lịch sử trả nợ tốt)</span>
          </div>
          <div className="c-rule pass">
            <span>✓ Tỷ lệ đòn bẩy DTI: 28% (Ngưỡng an toàn &lt; 40%)</span>
          </div>
          <div className="c-rule approved">
            <span>✓ Hạn mức đề xuất: 2.000.000.000đ (Trình Ban Thẩm định)</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>🛡️ Kiểm soát rủi ro tín dụng đa tầng</span>
        <span>📑 Tự động tổng hợp tờ trình thẩm định</span>
      </div>
    </div>
  );
}

/**
 * 12. Professional Services & Legal Visual
 */
export function ProfessionalServicesVisual() {
  return (
    <div className="industry-artifact-card prof-serv-artifact" aria-label="Bảng quản lý Dịch vụ Chuyên nghiệp">
      <div className="artifact-header">
        <div className="artifact-badge-wrap">
          <span className="artifact-dot active" />
          <span className="artifact-title">RATE CARD &amp; SLA TIME BILLING</span>
        </div>
        <span className="artifact-tag navy">DỊCH VỤ CHUYÊN NGHIỆP</span>
      </div>

      <div className="artifact-body">
        <div className="client-case-card">
          <span className="case-title">Vụ việc: Thẩm định Pháp lý Hợp đồng M&amp;A</span>
          <span className="partner-name">Chuyên gia phụ trách: Luật sư Thành viên</span>
        </div>

        <div className="billing-breakdown">
          <div className="bill-row">
            <span>Rà soát Điều khoản Rủi ro (Tier 1)</span>
            <span>4.5 Giờ</span>
            <span className="bill-cost">13.500.000đ</span>
          </div>
          <div className="bill-row">
            <span>Hội thảo Tư vấn Cấp cao với Ban TGĐ</span>
            <span>2.0 Giờ</span>
            <span className="bill-cost">10.000.000đ</span>
          </div>
        </div>
      </div>

      <div className="artifact-footer">
        <span>⚖️ Minh bạch 100% nhật ký giờ công</span>
        <span>📑 Tự động xuất Timesheet đối soát</span>
      </div>
    </div>
  );
}
