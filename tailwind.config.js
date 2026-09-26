/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        '3xl': '1920px',
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          '"Malgun Gothic"',
          'sans-serif',
        ],
        serif: ['"Gowun Batang"', '"Noto Serif KR"', '"Nanum Myeongjo"', 'Georgia', 'serif'],
      },
      colors: {
        // 종이와 잉크: 페이지 바탕, 올린 면, 눌린 면
        paper: {
          DEFAULT: '#f4f0e8',
          raised: '#fbf9f4',
          sunken: '#ece6da',
          deep: '#e3dccd',
        },
        ink: {
          DEFAULT: '#1d1b17',
          soft: '#3b3730',
          muted: '#6d665a',
          faint: '#8a8274',
        },
        line: {
          DEFAULT: '#dcd4c4',
          strong: '#c5bba7',
          soft: '#e7e1d5',
        },
        // 장서인(인주) 빨강 — 로고, 인생책, 강조
        seal: {
          DEFAULT: '#a0312a',
          dark: '#82251f',
          soft: '#f5e6e0',
        },
        reading: {
          DEFAULT: '#2e5d8a',
          light: '#e5edf4',
          border: '#bccfe1',
          dark: '#244b70',
        },
        completed: {
          DEFAULT: '#4d7a2e',
          light: '#e8efdf',
          border: '#c6d7b0',
          dark: '#3b5f22',
        },
        star: '#b27d17',
        entry: {
          DEFAULT: '#a0312a',
        },
      },
      boxShadow: {
        lift: '0 1px 2px rgb(29 27 23 / 0.06), 0 12px 32px -12px rgb(29 27 23 / 0.28)',
        pop: '0 2px 6px rgb(29 27 23 / 0.08), 0 24px 48px -16px rgb(29 27 23 / 0.35)',
      },
    },
  },
  plugins: [],
};
