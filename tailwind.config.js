/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans KR"', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif KR"', 'Georgia', 'serif'],
      },
      colors: {
        reading: {
          DEFAULT: '#378ADD',
          light:   '#E6F1FB',
          border:  '#B5D4F4',
          dark:    '#185FA5',
        },
        completed: {
          DEFAULT: '#639922',
          light:   '#EAF3DE',
          border:  '#C0DD97',
        },
        entry: {
          DEFAULT: '#8B1A1A',
        },
      },
    },
  },
  plugins: [],
};
