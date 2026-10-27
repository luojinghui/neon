'use client';

import { Button, Skeleton } from 'antd';
import { InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useEffect } from 'react';
import PlazaEditor from './PlazaEditor';
import PlazaCard from './PlazaCard';
import { refreshPlaza, removePlazaMessage, usePlazaStore } from './store';

export default function Plaza({ active }: { active: boolean }) {
  const { items, nextCursor, loaded, busy, error, failedMore, clockOffset } = usePlazaStore();
  useEffect(() => {
    if (active && !usePlazaStore.getState().loaded) void refreshPlaza();
  }, [active]);

  return <div className="plaza-content">
    <PlazaEditor />
    <section aria-labelledby="plaza-feed-title" className="plaza-feed">
      <div className="plaza-feed-heading">
        <h2 id="plaza-feed-title">广场</h2>
        <Button type="text" aria-label="刷新广场" title="刷新" icon={<ReloadOutlined />} loading={busy === 'refresh'} disabled={busy === 'more'} onClick={() => void refreshPlaza()} />
      </div>
      {error && <div className="plaza-load-error" role="alert"><span>{error}</span><Button type="link" size="small" disabled={busy !== null} onClick={() => void refreshPlaza(failedMore)}>重试</Button></div>}
      {!loaded && busy && !items.length && <div className="cloud-panel"><Skeleton active paragraph={{ rows: 4 }} title={false} /></div>}
      {loaded && !items.length && <div className="plaza-empty"><InboxOutlined /><h3>这里还很安静</h3><p>分享一段文字、一张图片或一个文件</p></div>}
      <div className="plaza-card-list">{items.map(item => <PlazaCard key={item.messageId} item={item} clockOffset={clockOffset} onUnavailable={removePlazaMessage} />)}</div>
      {nextCursor && <div className="plaza-pagination"><Button loading={busy === 'more'} disabled={busy === 'refresh'} onClick={() => void refreshPlaza(true)}>加载更多</Button></div>}
      {loaded && items.length > 0 && !nextCursor && <p className="plaza-end">已展示全部内容</p>}
    </section>
  </div>;
}
