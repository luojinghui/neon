/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // 添加一些优化配置
  compiler: {
    // 移除控制台日志
    removeConsole: process.env.NODE_ENV === 'production'
  }
};

export default nextConfig;
