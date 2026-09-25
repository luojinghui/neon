import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  webpack(config) {
    if (config.cache && typeof config.cache === 'object' && config.cache.type === 'filesystem') {
      // Custom PostCSS sources must invalidate previously compiled CSS, including CI caches.
      config.cache.version = `${config.cache.version || ''}|neon-pointer-hover-v1`;
      config.cache.buildDependencies = {
        ...config.cache.buildDependencies,
        hoverPolicy: ['./postcss.config.mjs', './scripts/postcss-hover.cjs', './src/styles/hover-policy.js'].map(file => fileURLToPath(new URL(file, import.meta.url)))
      };
    }
    return config;
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  experimental: {
    workerThreads: false,
    cpus: 1
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        pathname: '/**'
      }
    ]
  }
};

export default nextConfig;
