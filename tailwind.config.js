/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html",
    "./src/**/*.{js,ts,jsx,tsx,html}"
  ],
  theme: {
    screens: {
      'xs': '375px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        navy: {
          950: '#0F172A',
          900: '#1E293B',
          850: '#334155',
          800: '#475569',
          700: '#1E3E62',
          600: '#2C5685',
          100: '#E2E8F0',
          50: '#F8FAFC',
        },
        gold: {
          900: '#5C4010',
          800: '#755115',
          700: '#8C651C',
          600: '#B0842B',
          500: '#C59B3F',
          400: '#D4B86A',
          300: '#E1CB8F',
          200: '#EEDFB9',
          100: '#F7F0DC',
          50: '#FCF9F0',
        },
        warm: {
          50: '#FDFBF7',
          100: '#F9F6F0',
          200: '#F0EBE1',
          300: '#E2D9C8',
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'gold-glow': '0 4px 20px -2px rgba(197, 155, 63, 0.25)',
        'gold-glow-lg': '0 10px 30px -4px rgba(197, 155, 63, 0.35)',
        'card-light': '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 8px -2px rgba(15, 23, 42, 0.03)',
        'card-hover': '0 20px 35px -5px rgba(15, 23, 42, 0.08), 0 10px 15px -3px rgba(15, 23, 42, 0.04)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
}
