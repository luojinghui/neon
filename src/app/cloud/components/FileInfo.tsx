/**
 * 文件信息（仅用于文件回显/下载）
 */

import { DownloadOutlined, PaperClipOutlined } from '@ant-design/icons';
import { useCloudStore } from '../store';
import { CloudAPI, CloudFileInfo } from '@/action';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function QueryFileItem({ file }: { file: CloudFileInfo }) {
  const handleDownload = () => {
    const url = CloudAPI.getFileDownloadUrl(file.fileId);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.fileName;
    a.click();
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-background-secondary/65 px-3 py-2.5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-foreground-secondary"><PaperClipOutlined /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground" title={file.relativePath || file.fileName}>
          {file.relativePath || file.fileName}
        </p>
        <p className="mt-0.5 text-xs text-foreground-muted">{formatFileSize(file.fileSize)}</p>
      </div>
      <button type="button" onClick={handleDownload} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-primary hover:bg-primary-soft hover:text-primary-hover shrink-0" aria-label={`下载 ${file.fileName}`} title="下载">
        <DownloadOutlined />
      </button>
    </div>
  );
}

export default function FileInfo() {
  const queryFiles = useCloudStore((state) => state.queryFiles);

  if (!queryFiles || queryFiles.length === 0) return null;

  return (
    <section aria-labelledby="cloud-files-heading" className="cloud-panel">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="cloud-files-heading" className="text-base font-semibold text-foreground">文件</h2>
        <span className="text-foreground-muted text-xs">
          {queryFiles.length} 个文件 · 共 {formatFileSize(queryFiles.reduce((sum, f) => sum + f.fileSize, 0))}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {queryFiles.map((file) => (
          <QueryFileItem key={file.fileId} file={file} />
        ))}
      </div>
    </section>
  );
}
