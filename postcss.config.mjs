import path from 'node:path';
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    [path.resolve('scripts/postcss-hover.cjs')]: {},
  },
};

export default config;
