import type { Config } from 'tailwindcss';

export default {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],

  theme: {
    extend: {
      colors: {
        neon_bg: 'var(--neon_bg)',
        neon_bg_1: 'var(--neon_bg_1)',
        neon_bg_2: 'var(--neon_bg_2)',
        neon_bg_3: 'var(--neon_bg_3)',
        neon_bg_4: 'var(--neon_bg_4)',

        neon_fgb: 'var(--neon_fgb)',

        neon_line: 'var(--neon_line)'
      }
    }
  },
  plugins: []
} satisfies Config;
