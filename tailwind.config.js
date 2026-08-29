/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}"
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#060D17',
          900: '#0B192C',
          850: '#10223B',
          800: '#162C4B',
          700: '#1E3E62',
          600: '#2C5685',
        },
        gold: {
          700: '#95712E',
          600: '#B0883C',
          500: '#C89D4D',
          400: '#DDB569',
          300: '#EACB8D',
          100: '#FBF5E8',
          50: '#FCF9F2',
        },
        bronze: {
          600: '#8C6239',
          500: '#A07243',
          400: '#B98958',
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'gold-glow': '0 0 25px -5px rgba(200, 157, 77, 0.25)',
        'gold-glow-lg': '0 0 40px -5px rgba(200, 157, 77, 0.4)',
        'navy-card': '0 10px 30px -10px rgba(6, 13, 23, 0.6)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
}
