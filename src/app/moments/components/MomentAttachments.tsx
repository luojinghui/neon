import { DownloadOutlined, PaperClipOutlined } from '@ant-design/icons';
import type { MomentAttachment } from '../types';

export function MomentAttachments({ attachments = [] }: { attachments?: MomentAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <ul className="mx-4 grid min-w-0 gap-2" aria-label="心迹附件">
      {attachments.map((file) => (
        <li key={file.id} className="min-w-0">
          <a href={file.url} download={file.name} className="flex min-w-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-primary hover:bg-background-secondary">
            <PaperClipOutlined aria-hidden="true" />
            <span className="min-w-0 flex-1 break-all">{file.name}</span>
            <span className="shrink-0 text-xs text-foreground-muted">{file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(file.size / 1024))} KB`}</span>
            <DownloadOutlined aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
