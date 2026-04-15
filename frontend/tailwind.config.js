/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#4D3DB7',
          'purple-light': '#6A5DE0',
          teal: '#33D3CF',
          'teal-light': '#74EFEA',
          lavender: '#D8C4FF',
          'lavender-light': '#E8DDFF',
        },
        dark: '#14162B',
        muted: '#5B6077',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        xl: '18px',
      },
      boxShadow: {
        card: '0 18px 50px rgba(17, 18, 35, 0.10)',
        soft: '0 4px 20px rgba(17, 18, 35, 0.08)',
      },
      keyframes: {
        progress: {
          '0%':   { transform: 'translateX(-200%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        progress: 'progress 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
