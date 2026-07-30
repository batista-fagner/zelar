/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        zelar: {
          brown: {
            DEFAULT: '#695e4a',
            50: '#f7f5f1',
            100: '#ede8de',
            200: '#d9cfba',
            300: '#c0af8d',
            400: '#a5906c',
            500: '#8a7857',
            600: '#6f6247',
            700: '#695e4a',
            800: '#544a3a',
            900: '#443d30',
          },
          cream: '#f7f2e7',
          sage: '#95b3a9',
          blue: '#5a7e96',
          peach: '#f7ba8b',
          pink: '#e0ac9e',
          purple: '#7a75b5',
          yellow: '#e6e0b0',
        },
      },
    },
  },
  plugins: [],
}
