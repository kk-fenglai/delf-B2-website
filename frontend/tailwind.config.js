/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--bgElevated)',
        text: 'var(--text)',
        muted: 'var(--textMuted)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        accent: 'var(--accent)',
        accent2: 'var(--accent2)',
        // Studio brand palette (blue / cyan / violet)
        brand: {
          DEFAULT: '#2563eb',   // electric blue
          light: '#3b82f6',
          dark: '#1e40af',
          ink: '#0b1220',
          cyan: '#22d3ee',
          violet: '#a78bfa',
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
