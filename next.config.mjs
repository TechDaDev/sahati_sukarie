/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // puppeteer must stay external to the server bundle (native launcher + chromium binary)
  serverExternalPackages: ['puppeteer'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    ];
  },
};
export default nextConfig;
