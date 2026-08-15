import { NextResponse } from 'next/server';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

// Server-side Zod validation schema for incoming leads
const leadSchema = z.object({
  fullName: z
    .string({ required_error: 'Vui lòng nhập họ và tên' })
    .trim()
    .min(2, 'Họ và tên cần có ít nhất 2 ký tự')
    .max(100, 'Họ và tên không được vượt quá 100 ký tự'),
  phone: z
    .string({ required_error: 'Vui lòng nhập số điện thoại hoặc Zalo' })
    .trim()
    .min(8, 'Số điện thoại không hợp lệ')
    .max(20, 'Số điện thoại không hợp lệ')
    .regex(/^[0-9+().\s-]+$/, 'Số điện thoại chỉ được chứa chữ số và dấu phân tách hợp lệ'),
  email: z
    .string({ required_error: 'Vui lòng nhập email công việc' })
    .trim()
    .email('Địa chỉ email không đúng định dạng')
    .max(120, 'Email không được vượt quá 120 ký tự'),
  company: z
    .string({ required_error: 'Vui lòng nhập tên công ty hoặc doanh nghiệp' })
    .trim()
    .min(2, 'Tên doanh nghiệp cần có ít nhất 2 ký tự')
    .max(150, 'Tên doanh nghiệp không được vượt quá 150 ký tự'),
  workflow: z.enum(['orders', 'knowledge', 'campaigns', 'custom'], {
    errorMap: () => ({ message: 'Vui lòng chọn quy trình quan tâm hợp lệ' }),
  }),
  note: z.string().trim().max(500, 'Ghi chú không được vượt quá 500 ký tự').optional(),
  // Anti-bot honeypot field (must be empty)
  website: z.string().optional(),
});

// Simple in-memory rate limiter (5 submissions per 10 minutes per IP)
const ipRequestHistory = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipRequestHistory.get(ip) ?? [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    ipRequestHistory.set(ip, validTimestamps);
    return true;
  }

  validTimestamps.push(now);
  ipRequestHistory.set(ip, validTimestamps);
  return false;
}

// Helper to mask PII for safe server logging
function maskPII(str: string, type: 'email' | 'phone'): string {
  if (type === 'email') {
    const [user, domain] = str.split('@');
    if (!user || !domain) return '***@***';
    return `${user.slice(0, 1)}***@${domain}`;
  }
  if (str.length <= 4) return '****';
  return `${str.slice(0, 3)}***${str.slice(-3)}`;
}

// Lead persistence helper
function persistLeadLocally(leadData: Record<string, unknown>): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const leadsFilePath = path.join(dataDir, 'leads.json');
    let leads: Array<Record<string, unknown>> = [];
    if (fs.existsSync(leadsFilePath)) {
      const fileContent = fs.readFileSync(leadsFilePath, 'utf-8');
      try {
        leads = JSON.parse(fileContent) as Array<Record<string, unknown>>;
      } catch {
        leads = [];
      }
    }
    leads.push(leadData);
    fs.writeFileSync(leadsFilePath, JSON.stringify(leads, null, 2), 'utf-8');
  } catch (err) {
    // In read-only serverless filesystems, gracefully handle file write failure
    console.warn('[Leads Persistence] Local file write skipped or failed:', (err as Error).message);
  }
}

export async function POST(request: Request) {
  try {
    // 1. IP extraction for rate limiting
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0]?.trim() ?? 'unknown' : 'unknown';

    if (clientIp !== 'unknown' && isRateLimited(clientIp)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Bạn đã gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau vài phút.',
        },
        { status: 429 }
      );
    }

    // 2. Parse & Validate Payload
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Dữ liệu yêu cầu không hợp lệ' },
        { status: 400 }
      );
    }

    const validationResult = leadSchema.safeParse(body);

    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0]?.message ?? 'Thông tin không hợp lệ';
      return NextResponse.json(
        { success: false, message: firstError, errors: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { fullName, phone, email, company, workflow, note, website } = validationResult.data;

    // 3. Honeypot check: If bot filled the hidden website field, return fake 200 without saving
    if (website && website.trim().length > 0) {
      return NextResponse.json({
        success: true,
        message: 'Yêu cầu của bạn đã được ghi nhận.',
      });
    }

    // 4. Create Lead Record
    const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newLead = {
      leadId,
      createdAt: new Date().toISOString(),
      fullName,
      phone,
      email,
      company,
      workflow,
      note: note || '',
      source: 'nexagnet247.com/demo',
    };

    // 5. Persist lead
    persistLeadLocally(newLead);

    // 6. Safe server audit logging (PII masked)
    console.info(
      `[Lead Submitted] ID=${leadId} Company="${company}" Workflow=${workflow} Email=${maskPII(
        email,
        'email'
      )} Phone=${maskPII(phone, 'phone')}`
    );

    return NextResponse.json({
      success: true,
      message: 'Yêu cầu tư vấn của bạn đã được tiếp nhận thành công.',
      leadId,
    });
  } catch (error) {
    console.error('[Lead API Error]', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Đã xảy ra lỗi máy chủ trong quá trình xử lý. Vui lòng thử lại sau.',
      },
      { status: 500 }
    );
  }
}
