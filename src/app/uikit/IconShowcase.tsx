'use client';

import { useState } from 'react';
import { Icon, iconNames } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import styles from './uikit.module.css';

export function IconShowcase() {
  const [query, setQuery] = useState('');
  const [liked, setLiked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState('');
  const names = iconNames.filter(name => name.includes(query.trim().toLowerCase()));
  const visibleNames = expanded || query.trim() ? names : names.slice(0, 24);
  return <Card bodyClassName={styles.stack}>
    <div className={styles.exampleHeading}><h3>图标与交互状态</h3><code>Icon</code></div>
    <div className={styles.row}>
      <Button variant="ghost" feedback="none" aria-label={liked ? '取消点赞示例' : '点赞示例'} aria-pressed={liked} icon={<Icon name="heart" active={liked} />} onClick={() => setLiked(!liked)}>{liked ? 1 : null}</Button>
      <Button variant="ghost" feedback="none" icon={<Icon name="comment" />} aria-label="评论图标示例">3</Button>
      <Icon name="globe" size="sm" /><Icon name="globe" /><Icon name="globe" size="lg" />
      <Icon name="check-circle" tone="success" label="成功状态" /><Icon name="loading" label="正在加载示例" />
    </div>
    <div className={styles.iconTools}>
      <Input className={styles.search} prefix={<Icon name="search" />} aria-label="搜索图标名称" placeholder="搜索图标，如 heart、cloud" value={query} onChange={event => setQuery(event.target.value)} allowClear />
      <span className={styles.note}>{names.length} 个图标</span>
    </div>
    <div className={styles.iconGrid}>{visibleNames.map(name => <Button key={name} align="start" variant="ghost" icon={<Icon name={name} />} aria-label={`复制 ${name} 图标用法`} onClick={async () => {
      try { await navigator.clipboard.writeText(`<Icon name="${name}" />`); setCopied(`已复制 ${name}`); } catch { setCopied('复制失败，请重试'); }
    }}><span className={styles.iconName}>{name}</span></Button>)}</div>
    {!names.length && <p className={styles.empty}>没有匹配的图标</p>}
    <div className={styles.iconFooter}>
      <p className={styles.note} role="status" aria-live="polite">{copied || '点击图标复制用法'}</p>
      {!query.trim() && names.length > 24 && <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? '收起图标' : `展开全部 ${names.length} 个图标`}</Button>}
    </div>
  </Card>;
}
