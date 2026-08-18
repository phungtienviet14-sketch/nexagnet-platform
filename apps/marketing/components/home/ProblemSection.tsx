'use client';

import { NexagnetIcon } from '@/components/shared/EnterpriseIcons';

interface ProblemItem {
  id: string;
  iconKey: string;
  title: string;
  desc: string;
}

const PROBLEMS: ProblemItem[] = [
  {
    id: 'scattered',
    iconKey: 'chat',
    title: 'Quy trình nằm rải rác trên nhiều kênh',
    desc: 'Hội thoại đặt hàng, yêu cầu hỗ trợ và giao tiếp đại lý phân tán khắp các nhóm Zalo, Messenger và bảng tính cá nhân, thiếu một điểm tiếp nhận tập trung.',
  },
  {
    id: 'bottleneck',
    iconKey: 'queue',
    title: 'Thao tác lặp lại & nghẽn cổ chai nhân sự',
    desc: 'Đội ngũ sales và vận hành phải liên tục tra cứu bảng giá, đối soát tồn kho, gõ tay vào ERP và sao chép thủ công hàng trăm tin nhắn mỗi ngày.',
  },
  {
    id: 'uncontrolled-ai',
    iconKey: 'alert',
    title: 'Khó kiểm soát khi AI chỉ là chatbot rời rạc',
    desc: 'Các chatbot AI tự do dễ tạo ra thông tin sai lệch về giá, chính sách hoặc vượt quyền phê duyệt, gây rủi ro tài chính và làm tổn hại uy tín thương hiệu.',
  },
  {
    id: 'fragmented-tools',
    iconKey: 'layers',
    title: 'Khó mở rộng khi mỗi use case làm một tool riêng',
    desc: 'Doanh nghiệp bị kẹt trong ma trận các công cụ chắp vá: một tool cho chatbot web, một script cho Zalo, một app khác cho form — không thể đồng bộ dữ liệu chung.',
  },
];

export function ProblemSection() {
  return (
    <section className="problem-section" id="problem" aria-label="Thách thức vận hành của doanh nghiệp">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>THÁCH THỨC VẬN HÀNH THỰC TẾ</span>
          </div>

          <h2 className="section-headline">
            Doanh nghiệp không thiếu công việc.
            <br />
            Họ thiếu một hệ thống AI có kiểm soát.
          </h2>

          <p className="section-subheadline">
            Ứng dụng AI vào vận hành không đơn thuần là gắn một chatbot biết nói chuyện. Thách thức lớn nhất là làm sao để AI hiểu đúng ngôn ngữ tự nhiên nhưng hành động tuyệt đối theo quy tắc doanh nghiệp.
          </p>
        </div>

        <div className="problem-cards-grid">
          {PROBLEMS.map((item) => (
            <div key={item.id} className="problem-card">
              <div className="p-icon-box">
                <NexagnetIcon name={item.iconKey} size={22} containerStyle="subtle" />
              </div>
              <h3 className="p-title">{item.title}</h3>
              <p className="p-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
