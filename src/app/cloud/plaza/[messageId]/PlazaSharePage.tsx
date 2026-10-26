'use client';

import { App, Button, Skeleton } from 'antd';
import { FileTextOutlined, LeftOutlined, ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/topbar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import PlazaCard from '../PlazaCard';
import { getPlazaMessage, PlazaClientError } from '../client';
import { removePlazaMessage } from '../store';
import type { PlazaMessage } from '../types';
import '../../cloud.css';

function ShareContent({ messageId }: { messageId: string }) {
  const [state, setState] = useState<{ kind: 'loading' | 'ready' | 'gone' | 'invalid' | 'error'; item?: PlazaMessage; clockOffset: number }>({ kind: 'loading', clockOffset: 0 });
  const [attempt, setAttempt] = useState(0);
  const unavailable = useCallback((id: string) => { removePlazaMessage(id); setState({ kind: 'gone', clockOffset: 0 }); }, []);
  useEffect(() => {
    let active = true;
    if (!/^[a-f0-9]{32}$/.test(messageId)) { setState({ kind: 'invalid', clockOffset: 0 }); return; }
    setState({ kind: 'loading', clockOffset: 0 });
    getPlazaMessage(messageId).then(result => {
      if (active) setState({ kind: 'ready', item: result.item, clockOffset: Date.parse(result.serverNow) - Date.now() });
    }).catch(error => {
      if (active) setState({ kind: error instanceof PlazaClientError && error.status === 404 ? 'gone' : 'error', clockOffset: 0 });
    });
    return () => { active = false; };
  }, [messageId, attempt]);

  return <div className="cloud-page plaza-page plaza-share-page app-screen w-full bg-background flex flex-col">
    <TopBar middle="广场分享" leading={<Link href="/cloud/plaza" className="plaza-back"><LeftOutlined /><span>广场</span></Link>} right={<ThemeToggle />} />
    <main className="content w-full pt-[var(--app-page-top)] pb-8 flex-1 overflow-y-auto overflow-x-hidden">
      <div className="app-content-width plaza-content">
        {state.kind === 'loading' && <div className="cloud-panel"><Skeleton active title={false} paragraph={{ rows: 8 }} /></div>}
        {state.kind === 'ready' && state.item && <><PlazaCard key={state.item.messageId} item={state.item} detail clockOffset={state.clockOffset} onUnavailable={unavailable} /><p className="plaza-end">公开内容 · 发布后 48 小时自动失效</p></>}
        {state.kind !== 'loading' && state.kind !== 'ready' && <div className="plaza-share-empty">
          <div className="plaza-state-icon"><FileTextOutlined /></div>
          <h1>{state.kind === 'error' ? '暂时无法加载' : state.kind === 'invalid' ? '分享链接无效' : '内容已过期或被删除'}</h1>
          <p>{state.kind === 'error' ? '请检查网络连接，稍后再试' : state.kind === 'invalid' ? '检查一下链接是否完整' : '广场内容保留 48 小时，也可能已被主动删除'}</p>
          <div className="flex justify-center gap-3">{state.kind === 'error' && <Button icon={<ReloadOutlined />} onClick={() => setAttempt(value => value + 1)}>重试</Button>}<Link href="/cloud/plaza" className="plaza-home-link">前往广场</Link></div>
        </div>}
      </div>
    </main>
  </div>;
}

export default function PlazaSharePage({ messageId }: { messageId: string }) { return <App><ShareContent messageId={messageId} /></App>; }
