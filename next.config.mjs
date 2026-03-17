/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  experimental: {
    workerThreads: false,
    cpus: 1
  }
};

export default nextConfig;
