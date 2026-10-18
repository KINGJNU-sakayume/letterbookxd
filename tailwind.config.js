import plugin from 'tailwindcss/plugin';

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
          // 작은 글자에도 쓰이므로 둘 다 종이 바탕에서 4.5:1을 넘긴다 (muted 5.6:1, faint 4.6:1)
          muted: '#665f54',
          faint: '#726b5e',
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
  plugins: [
    // 손가락으로 누르는 기기: 버튼·별점처럼 작은 조작부의 누르는 면적을 넓힐 때 쓴다 (coarse:h-11)
    plugin(({ addVariant }) => {
      addVariant('coarse', '@media (pointer: coarse)');
    }),
  ],
};
