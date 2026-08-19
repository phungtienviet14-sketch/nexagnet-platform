import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { EmailNotificationConfig, LeadPayload } from '@netviet/shared';

export interface EmailDispatchResult {
  success: boolean;
  message?: string;
  recipientsSent: string[];
}

@Injectable()
export class EmailLeadDispatcher {
  private readonly logger = new Logger(EmailLeadDispatcher.name);

  async sendLeadEmail(payload: LeadPayload, config: EmailNotificationConfig): Promise<EmailDispatchResult> {
    if (!config.enabled) {
      return { success: false, message: 'Kênh gửi Email đang bị tắt trong cấu hình', recipientsSent: [] };
    }

    if (!config.host || !config.user || !config.pass || config.recipients.length === 0) {
      return {
        success: false,
        message: 'Cấu hình SMTP chưa đầy đủ (thiếu Host, User, Password hoặc danh sách người nhận)',
        recipientsSent: [],
      };
    }

    const transporter = this.createTransporter(config);
    const subject = `[Nexagnet Lead] Đăng ký trao đổi giải pháp 1-1: ${payload.company} - ${payload.fullName}`;
    const text = this.formatPlainText(payload);
    const html = this.formatHtml(payload);

    const fromAddress = config.from || `Nexagnet Lead Notification <${config.user}>`;

    try {
      await transporter.sendMail({
        from: fromAddress,
        to: config.recipients.join(', '),
        subject,
        text,
        html,
      });

      this.logger.log(`Đã gửi email lead thành công tới: ${config.recipients.join(', ')}`);
      return {
        success: true,
        recipientsSent: config.recipients,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Lỗi khi gửi email lead qua SMTP: ${err.message}`, err.stack);
      return {
        success: false,
        message: `Lỗi SMTP: ${err.message}`,
        recipientsSent: [],
      };
    }
  }

  async sendTestEmail(to: string, config: EmailNotificationConfig): Promise<{ success: boolean; message?: string }> {
    if (!config.host || !config.user || !config.pass) {
      return { success: false, message: 'Thiếu thông tin kết nối SMTP (Host, User, Pass)' };
    }

    const transporter = this.createTransporter(config);
    const fromAddress = config.from || `Nexagnet Test <${config.user}>`;

    try {
      await transporter.verify();
      await transporter.sendMail({
        from: fromAddress,
        to,
        subject: '[Nexagnet] Kiểm tra kết nối gửi Email SMTP thành công',
        text: 'Xin chào,\n\nĐây là email kiểm tra tính năng gửi thông báo tự động từ hệ thống Nexagnet Platform. Kết nối SMTP hoạt động bình thường!\n\nThời gian: ' + new Date().toLocaleString('vi-VN'),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f172a; margin-top: 0;">🎉 Kết nối Email SMTP thành công!</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              Đây là email kiểm tra tính năng gửi thông báo tự động từ hệ thống <strong>Nexagnet Platform</strong>.
            </p>
            <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 6px; border-left: 4px solid #10b981; margin: 16px 0;">
              <p style="margin: 0; font-size: 14px; color: #1e293b;">
                <strong>Thời gian gửi:</strong> ${new Date().toLocaleString('vi-VN')}<br />
                <strong>Máy chủ SMTP:</strong> ${config.host}:${config.port}
              </p>
            </div>
            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 0;">
              Hệ thống điều phối lead Nexagnet Marketing © 2026
            </p>
          </div>
        `,
      });

      return { success: true, message: `Email kiểm tra đã được gửi tới ${to}` };
    } catch (error) {
      const err = error as Error;
      return { success: false, message: `Xác thực SMTP thất bại: ${err.message}` };
    }
  }

  private createTransporter(config: EmailNotificationConfig) {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure || config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  private formatPlainText(payload: LeadPayload): string {
    const time = payload.createdAt || new Date().toLocaleString('vi-VN');
    return [
      '🔔 [NEXAGNET] YÊU CẦU ĐĂNG KÝ TRAO ĐỔI GIẢI PHÁP 1-1',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `👤 Khách hàng: ${payload.fullName}`,
      `🏢 Doanh nghiệp: ${payload.company}`,
      `📞 Số điện thoại / Zalo: ${payload.phone}`,
      `✉️ Email: ${payload.email}`,
      `🎯 Lĩnh vực / Quy trình: ${payload.workflow}`,
      `📝 Ghi chú: ${payload.note || '(Không có)'}`,
      `🌐 Nguồn: ${payload.source || 'nexagnet247.com'}`,
      `⏰ Thời gian: ${time}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '👉 Vui lòng liên hệ phản hồi khách hàng trong vòng 15-30 phút!',
    ].join('\n');
  }

  private formatHtml(payload: LeadPayload): string {
    const time = payload.createdAt || new Date().toLocaleString('vi-VN');
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 28px; color: #ffffff;">
          <span style="display: inline-block; background-color: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            Yêu cầu tư vấn mới
          </span>
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">
            Đăng ký trao đổi giải pháp 1-1
          </h2>
          <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8;">
            Khách hàng từ website <strong>nexagnet247.com</strong>
          </p>
        </div>

        <div style="padding: 28px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tbody>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; color: #64748b; width: 140px; font-weight: 500;">Họ và tên</td>
                <td style="padding: 12px 0; color: #0f172a; font-weight: 600; font-size: 15px;">${payload.fullName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; color: #64748b; font-weight: 500;">Doanh nghiệp</td>
                <td style="padding: 12px 0; color: #0f172a; font-weight: 600;">${payload.company}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; color: #64748b; font-weight: 500;">Số điện thoại / Zalo</td>
                <td style="padding: 12px 0; color: #0284c7; font-weight: 600;">
                  <a href="tel:${payload.phone}" style="color: #0284c7; text-decoration: none;">${payload.phone}</a>
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; color: #64748b; font-weight: 500;">Email liên hệ</td>
                <td style="padding: 12px 0; color: #0f172a;">
                  <a href="mailto:${payload.email}" style="color: #0f172a; text-decoration: none;">${payload.email}</a>
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; color: #64748b; font-weight: 500;">Quy trình quan tâm</td>
                <td style="padding: 12px 0; color: #0f172a;">
                  <span style="display: inline-block; background-color: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-weight: 500;">
                    ${payload.workflow}
                  </span>
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 0; color: #64748b; font-weight: 500; vertical-align: top;">Ghi chú</td>
                <td style="padding: 12px 0; color: #334155; line-height: 1.5;">${payload.note || '<em>(Không có ghi chú thêm)</em>'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; color: #64748b; font-weight: 500;">Thời gian đăng ký</td>
                <td style="padding: 12px 0; color: #64748b; font-size: 13px;">${time}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 24px; padding: 16px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; font-size: 14px; color: #1e40af; font-weight: 500;">
              ⚡ <strong>Hành động đề xuất:</strong> Vui lòng liên hệ phản hồi khách hàng trong vòng <strong>15-30 phút</strong> để đạt tỷ lệ chuyển đổi cao nhất.
            </p>
          </div>

          <div style="margin-top: 24px; text-align: center;">
            <a href="tel:${payload.phone}" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-weight: 600; font-size: 14px; padding: 10px 24px; border-radius: 6px; text-decoration: none; margin-right: 12px;">
              📞 Gọi điện ngay
            </a>
            <a href="mailto:${payload.email}?subject=Nexagnet%20x%C3%A1c%20nh%E1%BA%ADn%20l%E1%BB%8Bch%20t%C6%B0%20v%E1%BA%A5n%20gi%E1%BA%A3i%20ph%C3%A1p%201-1" style="display: inline-block; background-color: #f1f5f9; color: #334155; font-weight: 600; font-size: 14px; padding: 10px 24px; border-radius: 6px; text-decoration: none;">
              ✉️ Gửi Email phản hồi
            </a>
          </div>
        </div>

        <div style="background-color: #f8fafc; padding: 16px 28px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
          Nexagnet Enterprise AI Operations Platform · Thông báo tự động từ Lead Dispatch System
        </div>
      </div>
    `;
  }
}
