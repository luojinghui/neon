'use client';

import { Button, buttonClassName } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { createMomentHref } from '@/app/moments/navigation';
import { useSoulStore } from '../../store';

export function ShareMomentDialog() {
  const share = useSoulStore((state) => state.momentShare);
  const params = useParams<{ roomId: string }>();
  const [note, setNote] = useState('');
  if (!share) return null;
  const detailHref = createMomentHref(share.momentId, { returnTo: params.roomId ? `/soul/${params.roomId}` : undefined });
  const url = `${window.location.origin}${share.path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNote('链接已复制');
    } catch {
      setNote('请手动复制下面的链接');
    }
  };

  return (
    <Modal title="已投进星河" open onCancel={() => { setNote(''); useSoulStore.getState().setMomentShare(null); }} footer={null} centered destroyOnHidden width={440}>
      <p className="text-body text-foreground-secondary">这段聊天已按原来的先后顺序公开。</p>
      <Input className="mt-3" readOnly value={url} aria-label="星语分享链接" onFocus={(event) => event.currentTarget.select()} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" type="button" onClick={() => void copy()}>复制链接</Button>
        <Link href={detailHref} className={buttonClassName({ variant: 'outline' })}>去星河看看</Link>
      </div>
      {note && <p className="mt-2 text-caption text-foreground-muted" role="status">{note}</p>}
    </Modal>
  );
}
