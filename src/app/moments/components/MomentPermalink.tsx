'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getMoment } from '../client';
import { refreshMomentFeed } from '../useMomentFeed';
import type { Moment } from '../types';
import { MomentViewer } from './MomentViewer';

export function MomentPermalink() {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = search.get('moment') || '';
  const [result, setResult] = useState<{ id: string; moment: Moment | null; error: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    if (!/^[A-Za-z0-9_-]{16}$/.test(id)) {
      setResult({ id, moment: null, error: '心迹地址无效' });
      return;
    }
    const controller = new AbortController();
    getMoment(id, controller.signal).then((moment) => {
      if (!controller.signal.aborted) setResult({ id, moment, error: '' });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ id, moment: null, error: error instanceof Error ? error.message : '心迹加载失败' });
    });
    return () => controller.abort();
  }, [id]);

  const close = () => {
    const next = new URLSearchParams(search.toString());
    next.delete('moment');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    setResult(null);
  };

  if (!id) return null;
  if (result?.id !== id) return <p className="px-4 py-2 text-sm text-foreground-muted" role="status">正在读取指定心迹…</p>;
  if (result.error) return <div className="moment-inline-error" role="alert">{result.error}<button type="button" className="ml-3 text-primary" onClick={close}>关闭</button></div>;
  if (!result.moment) return null;
  return <MomentViewer moment={result.moment} onClose={close} onDeleted={() => { close(); void refreshMomentFeed(false, true); }} />;
}
