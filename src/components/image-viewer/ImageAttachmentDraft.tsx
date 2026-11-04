'use client';

import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function ImageAttachmentDraft({ file, onRemove, disabled = false }: { file: File; onRemove?: () => void; disabled?: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-surface-inset">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url && <img src={url} alt={file.name} className="h-full w-full object-contain" />}
    {onRemove && <Button size="sm" iconOnly type="button" disabled={disabled} aria-label={`移除图片 ${file.name}`} onClick={onRemove} className="absolute right-0 top-0">×</Button>}
  </div>;
}
