import { ImageResponse } from 'next/og';

export const alt = 'nexagnet — Nền tảng AI Agent cho vận hành doanh nghiệp';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 80px',
          backgroundColor: '#F5F3EE',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top: Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#111318',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#3D5AFE',
              }}
            />
          </div>
          <span
            style={{
              fontSize: '32px',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              color: '#111318',
            }}
          >
            nexagnet
          </span>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#3D5AFE',
              backgroundColor: 'rgba(61, 90, 254, 0.1)',
              padding: '6px 14px',
              borderRadius: '999px',
              marginLeft: '12px',
            }}
          >
            ENTERPRISE AI PLATFORM
          </span>
        </div>

        {/* Center: Main Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h1
            style={{
              fontSize: '56px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              color: '#111318',
              margin: 0,
            }}
          >
            AI cho từng quy trình
            <br />
            vận hành của bạn.
          </h1>
          <p
            style={{
              fontSize: '22px',
              color: '#656762',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Tự động hóa từng quy trình từ hội thoại — mà vẫn duy trì quy tắc và quyền kiểm soát.
          </p>
        </div>

        {/* Bottom: Philosophy & Architecture Pillar Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(17, 19, 24, 0.12)',
            paddingTop: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111318' }}>
              • AI trích xuất có ràng buộc
            </span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111318' }}>
              • Rules Engine tất định
            </span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111318' }}>
              • Cổng kiểm duyệt nhân sự
            </span>
          </div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#3D5AFE' }}>
            nexagnet247.com
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
