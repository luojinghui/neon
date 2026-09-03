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
  className?: string;
};

export function TopBar({ middle, right, backHref = '/', backLabel = '首页', className }: TopBarProps) {
  const middleNode = typeof middle === 'string' ? <span className="text-lg font-medium">{middle}</span> : middle ?? <span className="text-lg font-medium">标题</span>;

  return (
    <div className={`fixed left-0 top-0 z-10 w-full ${className || ''}`}>
      <div className="mx-auto max-w-[1312px] px-4 pt-3">
        <div className="relative flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/90 p-2 backdrop-blur-sm">
          <Link
            href={backHref}
            replace
            className="relative z-10 inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border bg-surface text-foreground-secondary shadow-sm transition-colors hover:bg-surface-active hover:text-primary"
            aria-label={`返回${backLabel}`}
            title={`返回${backLabel}`}
          >
            <LeftOutlined className="text-sm" />
          </Link>

          {/* 始终居中：不受左右内容宽度影响 */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 w-[min(60%,_520px)] -translate-x-1/2 -translate-y-1/2 text-center text-foreground">
            <div className="truncate">{middleNode}</div>
          </div>

          <div className="relative z-10 flex shrink-0 items-center justify-end [&_button]:touch-manipulation">{right}</div>
        </div>
      </div>
    </div>
  );
}
