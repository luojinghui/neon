/**
 * 文件信息卡片组件（仅用于文件回显/下载）
 */

import { Card } from 'antd';
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
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-tertiary group max-w-full">
      <PaperClipOutlined className="text-foreground-muted text-xs shrink-0" />
      <span className="text-sm text-foreground truncate max-w-[340px]" title={file.relativePath || file.fileName}>
        {file.relativePath || file.fileName}
      </span>
      <span className="text-xs text-foreground-muted shrink-0">{formatFileSize(file.fileSize)}</span>
      <button type="button" onClick={handleDownload} className="inline-flex items-center justify-center text-primary hover:text-primary-hover shrink-0" title="下载">
        <DownloadOutlined className="text-xs" />
      </button>
    </div>
  );
}

export default function FileInfo() {
  const queryFiles = useCloudStore((state) => state.queryFiles);

  if (!queryFiles || queryFiles.length === 0) return null;

  return (
    <Card
      title="文件"
      className="w-full"
      styles={{
        body: { padding: '12px' },
        header: { padding: '8px 12px', minHeight: '40px' }
      }}
    >
      <div className="space-y-2">
        <span className="text-foreground-muted text-xs">
          附件（{queryFiles.length} 个文件，共 {formatFileSize(queryFiles.reduce((sum, f) => sum + f.fileSize, 0))}）
        </span>
        <div className="flex flex-wrap gap-2">
          {queryFiles.map((file) => (
            <QueryFileItem key={file.fileId} file={file} />
          ))}
        </div>
      </div>
    </Card>
  );
}
