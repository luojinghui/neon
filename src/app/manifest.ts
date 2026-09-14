import type { MetadataRoute } from 'next';
import { PWA_NAME, PWA_THEME_COLORS } from '@/lib/pwa';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: PWA_NAME,
    short_name: PWA_NAME,
    description: '云传、星球聊天与漫游相机，你的轻量生活空间。',
    lang: 'zh-CN',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: PWA_THEME_COLORS.light,
    theme_color: PWA_THEME_COLORS.light,
    icons: [
      { src: '/icons/soul-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/soul-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/soul-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/soul-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      { name: '云传', url: '/cloud', description: '传输文字和文件' },
      { name: '星球', url: '/soul', description: '进入你的聊天星球' },
      { name: '漫游相机', url: '/doodle', description: '创作漫画涂鸦' }
    ]
  };
}
