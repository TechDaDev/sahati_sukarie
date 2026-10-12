import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF5FB', 100: '#DCEAF6', 200: '#BBD5EC', 300: '#8FB8DC',
          400: '#5C93C6', 500: '#2463A6', 600: '#1E5590', 700: '#184673',
          800: '#123454', 900: '#0D2438',
        },
        teal: { 50: '#E7F7F6', 100: '#CDEFEE', 300: '#7ED0CC', 500: '#16A6A0', 700: '#0F7C77' },
        ink: { DEFAULT: '#17324D', soft: '#3C5872', muted: '#6B8299' },
        canvas: '#F5F9FC',
        warn: '#E6A23C',
        alert: '#C94949',
        ok: '#2F9E68',
      },
      fontFamily: { sans: ['Cairo', 'system-ui', 'Segoe UI', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(23,50,77,0.04), 0 6px 20px -8px rgba(23,50,77,0.14)',
        pop: '0 10px 40px -12px rgba(23,50,77,0.28)',
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.25rem' },
      screens: { xs: '420px' },
    },
  },
  plugins: [],
} satisfies Config;
