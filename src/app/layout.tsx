import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'صحتي وسكري — منصتك الشخصية لمتابعة مرض السكري',
    template: '%s | صحتي وسكري',
  },
  description:
    'منصة صحتي وسكري: سجّل قراءات السكر، وتابع أدويتك ونشاطاتك اليومية، واطلع على تطور حالتك الصحية من خلال تقارير ورسوم بيانية واضحة.',
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2463A6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-canvas">
        {children}
      </body>
    </html>
  );
}
