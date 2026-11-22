'use client';

import Link from 'next/link';
import type { IslandSummary } from '../core/types';
import styles from '../island-sky.module.css';

interface FloatingIslandNodeProps {
  island: IslandSummary;
  variant: 'own' | 'friend';
  index?: number;
}

/**
 * 定制水彩绘本浮岛节点：
 * - 主岛（own）：使用专属水彩手绘主浮岛（大树、石灯笼、长椅与草坡），暗夜模式自动点亮石灯微光
 * - 好友岛（friend）：使用轻巧水彩石拱绣球浮岛，错落悬浮于天海之间
 */
export function FloatingIslandNode({ island, variant, index = 0 }: FloatingIslandNodeProps) {
  const isOwn = variant === 'own';
  const delay = isOwn ? '0s' : `${((index % 5) * 0.85).toFixed(2)}s`;

  const ariaLabel = island.onlineCount > 0
    ? `进入${island.name}，当前 ${island.onlineCount} 人在线`
    : `进入${island.name}`;

  return (
    <Link
      href={`/island/${encodeURIComponent(island.id)}`}
      className={`${styles.islandNode} ${isOwn ? styles.islandNodeOwn : styles.islandNodeFriend}`}
      style={{ animationDelay: delay }}
      aria-label={ariaLabel}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className={styles.islandArtWrap}>
        <span className={styles.islandAura} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={isOwn ? '/island-assets/island-main.webp' : '/island-assets/island-friend.webp'}
          alt=""
          className={isOwn ? styles.islandImgOwn : styles.islandImgFriend}
          draggable={false}
          decoding="async"
        />
        {/* 暗夜模式下石灯笼透出的柔和暖光 */}
        <span
          className={isOwn ? styles.lanternGlowOwn : styles.lanternGlowFriend}
          aria-hidden="true"
        />
      </div>

      <div className={styles.islandMeta}>
        {island.onlineCount > 0 && <span className={styles.onlineDot} aria-hidden="true" />}
        <span className={styles.islandName}>{island.name}</span>
      </div>
    </Link>
  );
}
