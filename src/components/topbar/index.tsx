'use client';

import { LeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

type TopBarProps = {
  /**
   * 中间区域：
   * - 传 string：使用默认标题样式渲染（推荐）
   * - 传 ReactNode：完全自定义渲染
   */
  middle?: string | ReactNode;
  /** 右侧区域：按钮/开关/业务操作区 */
  right?: ReactNode;
  /** 无法回退时的兜底跳转，默认首页 */
  fallbackHref?: string;
  className?: string;
};

export function TopBar({ middle, right, fallbackHref = '/', className }: TopBarProps) {
  const router = useRouter();

  const middleNode = typeof middle === 'string' ? <span className="text-lg font-medium">{middle}</span> : middle ?? <span className="text-lg font-medium">标题</span>;

  const handleBack = () => {
    if (typeof window === 'undefined') return;
    // 判断是否可以回退：
    // 1. history.length > 2: 说明有多次跳转历史
    // 2. document.referrer 存在且是站内页面：刷新后也能正常返回
    const referrerUrl = new URL(document.referrer, window.location.origin);
    const isInternalReferrer = referrerUrl.origin === window.location.origin && referrerUrl.pathname !== '/';
    const hasHistory = window.history.length > 2;
    
    if (hasHistory || isInternalReferrer) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <div className={`fixed top-0 left-0 w-full z-10 ${className || ''}`}>
      <div className="max-w-screen-xl mx-auto px-4 h-14 m-3">
        <div className="relative flex items-center justify-between gap-2 bg-surface/90 backdrop-blur-sm p-2 rounded-lg border border-border">
          <button
            type="button"
            onClick={handleBack}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm hover:shadow-md hover:bg-surface-active"
            aria-label="返回"
          >
            <LeftOutlined className="text-xl text-foreground" />
          </button>

          {/* 始终居中：不受左右内容宽度影响 */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 w-[min(60%,_520px)] -translate-x-1/2 -translate-y-1/2 text-center text-foreground">
            <div className="pointer-events-auto truncate">{middleNode}</div>
          </div>

          <div className="shrink-0 flex items-center justify-end">{right}</div>
        </div>
      </div>
    </div>
  );
}
