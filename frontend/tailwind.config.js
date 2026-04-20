/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1A3A5C',
          light: '#2C5F8D',
          dark: '#0F2338',
        },
        accent: {
          red: '#EF4135',   // 法国国旗红
          blue: '#0055A4',  // 法国国旗蓝
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        serif: ['Source Serif Pro', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
