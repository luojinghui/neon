'use client';

import { App, Button, Skeleton } from 'antd';
import { InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useEffect } from 'react';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { ProfileShortcut } from '@/app/profile/components/ProfileShortcut';
import CloudTabs from '../components/CloudTabs';
import NetworkInfo from '../components/NetworkInfo';
import PlazaEditor from './PlazaEditor';
import PlazaCard from './PlazaCard';
import { refreshPlaza, removePlazaMessage, usePlazaStore } from './store';
import '../cloud.css';

function Plaza() {
  const { items, nextCursor, loaded, busy, error, failedMore, clockOffset } = usePlazaStore();
  useEffect(() => { void refreshPlaza(); }, []);

  return <div className="cloud-page plaza-page app-screen w-full bg-background flex flex-col">
    <TopBar middle={<CloudTabs />} backHref="/" backLabel="首页" right={<><NetworkInfo /><ProfileShortcut returnTo="/cloud/plaza" /><ThemeToggle /></>} />
    <main className="content w-full pt-[var(--app-page-top)] pb-8 flex-1 overflow-y-auto overflow-x-hidden">
      <div className="app-content-width plaza-content">
        <PlazaEditor />
        <section aria-labelledby="plaza-feed-title" className="plaza-feed">
          <div className="plaza-feed-heading"><div><h2 id="plaza-feed-title">广场</h2><p>让内容在这里短暂停留</p></div>
            <Button type="text" icon={<ReloadOutlined />} loading={busy === 'refresh'} disabled={busy === 'more'} onClick={() => void refreshPlaza()}>刷新</Button>
          </div>
          {error && <div className="plaza-load-error" role="alert"><span>{error}</span><Button type="link" size="small" disabled={busy !== null} onClick={() => void refreshPlaza(failedMore)}>重试</Button></div>}
          {!loaded && busy && !items.length && <div className="cloud-panel"><Skeleton active paragraph={{ rows: 4 }} title={false} /></div>}
          {loaded && !items.length && <div className="plaza-empty"><InboxOutlined /><h3>这里还很安静</h3><p>分享一段文字、一张图片或一个文件</p><span>公开可见，48 小时后自动清理</span></div>}
          <div className="plaza-card-list">{items.map(item => <PlazaCard key={item.messageId} item={item} clockOffset={clockOffset} onUnavailable={removePlazaMessage} />)}</div>
          {nextCursor && <div className="plaza-pagination"><Button loading={busy === 'more'} disabled={busy === 'refresh'} onClick={() => void refreshPlaza(true)}>加载更多</Button></div>}
          {loaded && items.length > 0 && !nextCursor && <p className="plaza-end">已展示全部内容</p>}
        </section>
      </div>
    </main>
  </div>;
}

export default function PlazaPage() { return <App><Plaza /></App>; }
