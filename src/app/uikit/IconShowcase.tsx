'use client';

import { useState } from 'react';
import { Icon, iconNames } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from './uikit.module.css';

export function IconShowcase({ skin }: { skin: string }) {
  const [query, setQuery] = useState('');
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState('');
  const names = iconNames.filter(name => name.includes(query.trim().toLowerCase()));
  return <>
    <p className={styles.sectionNote}>页面图标统一通过 Icon 引用。尺寸、点赞反馈与加载动画由组件维护，跟随主题与减少动态效果偏好。</p>
    <div className={styles.skinGrid}>{(['light', 'dark'] as const).map(mode => <div key={mode} className={`${styles.skinPreview} ${mode}`} data-skin={skin} data-theme-preview={mode}>
      <h3>{mode === 'light' ? '浅色' : '深色'} · 图标状态</h3>
      <div className={styles.buttonRow}>
        <Button variant="ghost" feedback="none" aria-label={liked ? '取消点赞示例' : '点赞示例'} aria-pressed={liked} icon={<Icon name="heart" active={liked} />} onClick={() => setLiked(!liked)}>{liked ? 1 : null}</Button>
        <Button variant="ghost" feedback="none" icon={<Icon name="comment" />} aria-label="评论图标示例">3</Button>
        <Button loading>保存中</Button><Button disabled icon={<Icon name="download" />}>下载</Button>
      </div>
      <div className={styles.buttonRow}><Icon name="globe" size="sm" /><Icon name="globe" /><Icon name="globe" size="lg" /><Icon name="check-circle" tone="success" /><Icon name="loading" label="正在加载示例" /></div>
    </div>)}</div>
    <details className={styles.usage}><summary>用法</summary><pre className={styles.code}><code>{'<Button variant="ghost" feedback="none" aria-pressed={liked}\n  aria-label={liked ? "取消点赞" : "点赞"} icon={<Icon name="heart" active={liked} />}>\n  {count > 0 ? count : null}\n</Button>\n<Icon name="loading" />\n<Icon name="comment" size="sm" />\n<Button icon={<Icon name="copy" />} aria-label="复制" />'}</code></pre></details>
    <div className={styles.colorTools}><Input className={styles.search} prefix={<Icon name="search" />} aria-label="搜索图标名称" placeholder="搜索图标，如 heart、cloud、loading" value={query} onChange={event => setQuery(event.target.value)} /><span className={styles.resultCount}>{names.length} 个图标</span></div>
    <div className={styles.iconGrid}>{names.map(name => <Button key={name} align="start" variant="ghost" icon={<Icon name={name} />} aria-label={`复制 ${name} 图标用法`} onClick={async () => {
      try { await navigator.clipboard.writeText(`<Icon name="${name}" />`); setCopied(name); } catch { setCopied('复制失败'); }
    }}><span className={styles.iconName}>{name}</span></Button>)}</div>
    {!names.length && <p className={styles.empty}>没有匹配的图标</p>}
    <p className={styles.usage} role="status" aria-live="polite">{copied ? copied === '复制失败' ? '复制失败，请手动复制用法' : `已复制 ${copied}` : '点击图标复制用法'}</p>
  </>;
}
