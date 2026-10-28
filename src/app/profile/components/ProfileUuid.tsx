'use client';

import { CheckOutlined, CopyOutlined, IdcardOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';

export function ProfileUuid({ uuid }: { uuid: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const valueRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (status !== 'copied') return;
    const timer = window.setTimeout(() => setStatus('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      try {
        await navigator.clipboard.writeText(uuid);
      } catch {
        // 非安全来源或剪贴板权限受限时，尝试通过选中 UUID 复制。
        const selection = window.getSelection();
        if (!selection || !valueRef.current) throw new Error('无法复制');
        const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
        const range = document.createRange();
        range.selectNodeContents(valueRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
        try {
          if (!document.execCommand('copy')) throw new Error('无法复制');
        } finally {
          selection.removeAllRanges();
          ranges.forEach((previous) => selection.addRange(previous));
        }
      }
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  };

  return <div className="profile-detail min-w-0">
    <span className="profile-detail-icon"><IdcardOutlined /></span>
    <div className="min-w-0 flex-1">
      <dt>UUID</dt>
      <dd>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <code ref={valueRef} className="select-all break-all">{uuid}</code>
          <button type="button" onClick={() => void copy()} className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-primary hover:bg-primary-soft" aria-label={status === 'copied' ? 'UUID 已复制' : '复制 UUID'}>
            {status === 'copied' ? <CheckOutlined /> : <CopyOutlined />}{status === 'copied' ? '已复制' : '复制'}
          </button>
        </div>
        {status === 'error' && <p className="mt-1 text-danger" role="alert">复制失败，请选中 UUID 手动复制</p>}
        <span className="sr-only" role="status">{status === 'copied' ? 'UUID 已复制' : ''}</span>
      </dd>
    </div>
  </div>;
}
