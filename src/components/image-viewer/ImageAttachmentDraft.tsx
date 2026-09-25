'use client';

import { useEffect, useState } from 'react';

export function ImageAttachmentDraft({ file, onRemove, disabled = false }: { file: File; onRemove?: () => void; disabled?: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-background-secondary">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url && <img src={url} alt={file.name} className="h-full w-full object-contain" />}
    {onRemove && <button type="button" disabled={disabled} aria-label={`移除图片 ${file.name}`} onClick={onRemove} className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-bl-lg bg-black/60 text-white disabled:opacity-40">×</button>}
  </div>;
}
