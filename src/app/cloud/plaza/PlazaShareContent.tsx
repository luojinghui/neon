'use client';

import { buttonClassName } from '@/components/ui/button-styles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import { Skeleton } from '@/components/ui/display';
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import PlazaCard from './PlazaCard';
import { getPlazaMessage, PlazaClientError } from './client';
import { removePlazaMessage } from './store';
import type { PlazaMessage } from './types';
import { CloudLink } from '../components/CloudTabs';
import { isPlazaMessageId, PLAZA_PATH } from '../navigation';

export default function PlazaShareContent({ messageId }: { messageId: string }) {
  const [state, setState] = useState<{ kind: 'loading' | 'ready' | 'gone' | 'invalid' | 'error'; item?: PlazaMessage; clockOffset: number }>({ kind: 'loading', clockOffset: 0 });
  const [attempt, setAttempt] = useState(0);
  const unavailable = useCallback((id: string) => { removePlazaMessage(id); setState({ kind: 'gone', clockOffset: 0 }); }, []);
  useEffect(() => {
    let active = true;
    if (!isPlazaMessageId(messageId)) { setState({ kind: 'invalid', clockOffset: 0 }); return; }
    setState({ kind: 'loading', clockOffset: 0 });
    getPlazaMessage(messageId).then(result => {
      if (active) setState({ kind: 'ready', item: result.item, clockOffset: Date.parse(result.serverNow) - Date.now() });
    }).catch(error => {
      if (active) setState({ kind: error instanceof PlazaClientError && error.status === 404 ? 'gone' : 'error', clockOffset: 0 });
    });
    return () => { active = false; };
  }, [messageId, attempt]);

  return <div className="plaza-content">
        {state.kind === 'loading' && <Card as="div" padding="none" bodyWrap={false} className="cloud-panel"><Skeleton active title={false} paragraph={{ rows: 8 }} /></Card>}
        {state.kind === 'ready' && state.item && <PlazaCard key={state.item.messageId} item={state.item} detail clockOffset={state.clockOffset} onUnavailable={unavailable} />}
        {state.kind !== 'loading' && state.kind !== 'ready' && <div className="plaza-share-empty">
          <div className="plaza-state-icon"><FileTextOutlined /></div>
          <h1>{state.kind === 'error' ? '暂时无法加载' : state.kind === 'invalid' ? '分享链接无效' : '内容已过期或被删除'}</h1>
          <p>{state.kind === 'error' ? '请检查网络连接，稍后再试' : state.kind === 'invalid' ? '检查一下链接是否完整' : '内容已到期，或已被主动删除'}</p>
          <div className="flex justify-center gap-3">{state.kind === 'error' && <Button icon={<ReloadOutlined />} onClick={() => setAttempt(value => value + 1)}>重试</Button>}<CloudLink href={PLAZA_PATH} className={buttonClassName({ variant: 'primary' })}>前往广场</CloudLink></div>
        </div>}
  </div>;
}
