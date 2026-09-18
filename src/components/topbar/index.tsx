'use client';

import { LeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
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
  /** 返回按钮的明确去向，不依赖浏览器历史栈 */
  backHref?: string;
  /** 返回目的地名称 */
  backLabel?: string;
  /** 首页等不需要返回按钮的页面，可传入品牌标识。 */
  leading?: ReactNode;
  position?: 'fixed' | 'sticky';
  className?: string;
};

export function TopBar({ middle, right, backHref = '/', backLabel = '首页', leading, position = 'fixed', className }: TopBarProps) {
  const middleNode = typeof middle === 'string' ? <span className="truncate text-base font-semibold">{middle}</span> : middle ?? <span className="text-base font-semibold">标题</span>;

  return (
    <header className={`app-glass-header ${position === 'sticky' ? 'app-sticky-header sticky z-20' : 'app-topbar fixed z-10'} ${className || ''}`}>
      <div className="app-content-width">
        <div className="app-header-row app-topbar-grid">
          <div className="flex min-w-0 items-center">
            {leading ?? (
              <Link
                href={backHref}
                replace
                className="app-icon-button touch-manipulation"
                aria-label={`返回${backLabel}`}
                title={`返回${backLabel}`}
              >
                <LeftOutlined className="text-sm" />
              </Link>
            )}
          </div>

          <div className="app-topbar-title text-foreground">{middleNode}</div>

          <div className="app-topbar-controls [&_button]:touch-manipulation">{right}</div>
        </div>
      </div>
    </header>
  );
}
