'use client';

import Link from 'next/link';
import { NexagnetIcon } from '@/components/shared/EnterpriseIcons';

interface ChannelCard {
  name: string;
  tag: string;
  iconKey: string;
  desc: string;
  features: string[];
}

const CHANNELS: ChannelCard[] = [
  {
    name: 'Zalo Cá nhân & Zalo OA',
    tag: 'ĐẶC QUYỀN DOANH NGHIỆP VN',
    iconKey: 'chat',
    desc: 'Đọc và phản hồi tin nhắn trong nhóm đại lý, nhóm CTV hoặc tin nhắn 1-1 qua Zalo cá nhân/OA mà không cần @mention bắt buộc.',
    features: [
      'Đọc hiểu tin nhắn viết tắt, không dấu',
      'Phát tin CSKH định kỳ chống khóa kênh',
      'Đồng bộ hội thoại về hàng việc Sales',
    ],
  },
  {
    name: 'Messenger & Fanpage',
    tag: 'TƯ VẤN & BÁN LẺ 24/7',
    iconKey: 'pipeline',
    desc: 'Tự động phản hồi bình luận quảng cáo, nhắn tin tư vấn chi tiết, gửi hình ảnh/video sản phẩm và chốt đơn ngay trên Facebook.',
    features: [
      'Ẩn bình luận chứa SĐT chống cướp khách',
      'Gợi ý sản phẩm kèm link mua hàng',
      'Phân loại thẻ tag khách hàng tự động',
    ],
  },
  {
    name: 'Website Live Widget',
    tag: 'TƯ VẤN & THU LEAD WEB',
    iconKey: 'integration',
    desc: 'Tích hợp 1 dòng mã (embed script) lên mọi nền tảng website (WordPress, Next.js, Webflow, Shopify) để tư vấn và chuyển đổi traffic thành lead.',
    features: [
      'Chủ động mở lời chào theo trang đang xem',
      'Thu thập SĐT & thông tin nhu cầu tự nhiên',
      'Giao diện đồng bộ nhận diện thương hiệu',
    ],
  },
  {
    name: 'Telegram & Kênh Nội Bộ',
    tag: 'ĐIỀU HÀNH & CẢNH BÁO TỨC THÌ',
    iconKey: 'campaign',
    desc: 'Gửi thông báo đơn hàng mới, cảnh báo vượt ngưỡng an toàn và báo cáo doanh thu ngày tức thì về nhóm quản lý.',
    features: [
      'Thông báo trạng thái đơn hàng thời gian thực',
      'Nút bấm duyệt nhanh cho cấp quản lý',
      'Báo cáo tự động vào đầu và cuối ngày',
    ],
  },
];

export function OmnichannelSection() {
  return (
    <section className="omnichannel-section" id="channels" aria-label="Khả năng kết nối Đa kênh">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">
            <span className="section-eyebrow-dot" aria-hidden="true" />
            <span>KẾT NỐI ĐA KÊNH TOÀN DIỆN</span>
          </div>

          <h2 className="section-headline">
            Hiện diện mọi nơi khách hàng của bạn có mặt.
          </h2>

          <p className="section-subheadline">
            Một bộ não tri thức và quy tắc kinh doanh tập trung — kết nối mượt mà tới Zalo, Messenger, Website và Telegram.
          </p>
        </div>

        <div className="channels-grid">
          {CHANNELS.map((ch, idx) => (
            <div key={idx} className="channel-card">
              <div className="ch-top">
                <div className="ch-icon">
                  <NexagnetIcon name={ch.iconKey} size={22} containerStyle="subtle" />
                </div>
                <span className="ch-tag">{ch.tag}</span>
              </div>
              <h3 className="ch-name">{ch.name}</h3>
              <p className="ch-desc">{ch.desc}</p>
              <div className="ch-features-list">
                {ch.features.map((feat, fIdx) => (
                  <div key={fIdx} className="ch-feat-item">
                    <span className="feat-dot" aria-hidden="true" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="channels-bottom-cta">
          <div className="inner-box">
            <div className="text-col">
              <h4>Bạn đang quản lý hội thoại trên nhiều nền tảng phân tán?</h4>
              <p>nexagnet hợp nhất toàn bộ dữ liệu khách hàng về một màn hình điều hành duy nhất.</p>
            </div>
            <Link href="#demo" className="btn-primary">
              <span>Đăng ký kết nối kênh của bạn</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
