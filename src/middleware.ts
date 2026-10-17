/**
 * طبقة حماية أولى على مستوى الحافة (Edge).
 * ---------------------------------------------------------------------------
 * ملاحظة مهمة: هذاMiddleware يتفقد مجرد وجود كوكي الجلسة ولا يتحقق من صلاحيتها
 * لأن التحقق يحتاج قاعدة بيانات ولا يعمل في بيئة الحافة. لذلك فهو ليس مصدر
 * الحماية — الحماية الفعلية تُطبَّق دائمًا في صفحات الخادم وفي كل نقطة API
 * عبر requireSession()/guard() (راجع src/server/auth/session.ts).
 * الهدف هنا: تحويل المستخدم غير المسجّل مبكرًا إلى صفحة الدخول لتجربة أفضل.
 */
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/profile',
  '/glucose',
  '/medications',
  '/daily-log',
  '/reports',
  '/settings',
  '/urgent-help',
];

const ADMIN_PREFIXES = ['/admin'];
const ADMIN_PUBLIC = ['/admin/login', '/admin/accept-invitation'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('sahati_session')?.value);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-nonce', nonce);

  const continueWithPolicy = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', csp);
    return response;
  };

  if (ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const isPublic = ADMIN_PUBLIC.some((prefix) => pathname.startsWith(prefix));
    if (!hasSession && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      const response = NextResponse.redirect(url);
      response.headers.set('Content-Security-Policy', csp);
      return response;
    }
    return continueWithPolicy();
  }

  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const response = NextResponse.redirect(url);
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  return continueWithPolicy();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
