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
const ADMIN_PUBLIC = ['/admin/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('sahati_session')?.value);

  if (ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const isPublic = ADMIN_PUBLIC.some((prefix) => pathname.startsWith(prefix));
    if (!hasSession && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/profile/:path*',
    '/glucose/:path*',
    '/medications/:path*',
    '/daily-log/:path*',
    '/reports/:path*',
    '/settings/:path*',
    '/urgent-help/:path*',
    '/admin/:path*',
  ],
};
