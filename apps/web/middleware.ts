import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  EDGE_PROXY_HEADER,
  evaluateWebEdgeProxyRequest,
  readEdgeProxySecret,
} from './lib/edge-proxy';

/**
 * RUNTIME `nodejs`, KHONG PHAI `edge` — day la ca ly do tep nay chay duoc.
 *
 * O runtime `edge`, Next.js thay moi `process.env.X` bang GIA TRI LUC BUILD. Build khong he biet
 * bi mat (va khong duoc biet: no se nam trong artefact), nen bien se thanh `undefined` va khoa se
 * TAT mot cach im lang — dung cai hong te nhat: mot khoa bao cao la dang bao ve trong khi khong.
 * Runtime `nodejs` cho middleware da on dinh tu Next.js 15.5; ban repo dang dung la 15.5.25.
 *
 * `matcher` bao phu MOI duong, ke ca `/_next/*`. Bundle client khong phai bi mat, nhung mot origin
 * "chi cho edge goi" ma van tra ve tai nguyen cho bat ky ai thi khong con la mot cau khang dinh
 * sach — va dung sach moi kiem duoc.
 */
export const config = {
  runtime: 'nodejs',
  matcher: '/:path*',
};

export function middleware(request: NextRequest): NextResponse {
  const decision = evaluateWebEdgeProxyRequest(
    readEdgeProxySecret(),
    request.headers.get(EDGE_PROXY_HEADER),
  );
  if (decision.allowed) return NextResponse.next();
  // Than phan hoi khong noi gi ve khoa, ve header can co, hay ve viec co mot edge dung truoc.
  // Nguoi do khoa khong hoc duoc gi tu 403 nay ngoai "khong vao duoc".
  return new NextResponse('Forbidden', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
