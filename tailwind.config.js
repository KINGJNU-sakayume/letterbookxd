import plugin from 'tailwindcss/plugin';

// 색은 모두 src/styles/tokens.css 의 토큰에서 온다. bg-paper/90 같은 투명도 표기도 쓸 수 있게 color-mix로 감싼다.
const token = (name) => `color-mix(in oklch, var(--color-${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        '3xl': '1920px',
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        // 예전 이름을 그대로 두어 제목에 쓰던 font-serif 가 표시용 글꼴을 가리킨다
        serif: ['var(--font-display)'],
        mono: ['var(--font-outlier)'],
      },
      colors: {
        // 흰 종이: 페이지 바탕, 올린 면, 눌린 면
        paper: {
          DEFAULT: token('paper'),
          raised: token('paper'),
          sunken: token('paper-2'),
          deep: token('paper-3'),
        },
        // 색이 없는 먹
        ink: {
          DEFAULT: token('ink'),
          soft: token('ink-2'),
          muted: token('muted'),
          faint: token('faint'),
        },
        line: {
          DEFAULT: token('rule'),
          strong: token('rule-strong'),
          soft: token('rule-2'),
        },
        // 오류와 지우기에만 쓰는 빨강
        seal: {
          DEFAULT: token('error'),
          dark: token('error-ink'),
          soft: token('error-soft'),
        },
        // 청록 하나: 읽는 중
        reading: {
          DEFAULT: token('accent'),
          light: token('accent-soft'),
          border: token('accent-edge'),
          dark: token('accent-soft-ink'),
        },
        // 다 읽음은 먹으로
        completed: {
          DEFAULT: token('ink'),
          light: token('paper-3'),
          border: token('rule-strong'),
          dark: token('ink'),
        },
        star: token('ink'),
        entry: {
          DEFAULT: token('ink'),
        },
      },
      boxShadow: {
        lift: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        cover: 'var(--radius-cover)',
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
