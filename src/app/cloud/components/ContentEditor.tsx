/**
 * 内容编辑器组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2026-03-17 18:25:32
 */

import { useMemo, useRef } from 'react';
import { Card, Button, Input } from 'antd';
import {
  ClearOutlined,
  CopyOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  RocketOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import { useCloudStore, FileItem } from '../store';
import { neonCloud } from '../core';

const { TextArea } = Input;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function FileListItem({ item, onRemove }: { item: FileItem; onRemove: (id: string) => void }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-secondary group max-w-full">
      <PaperClipOutlined className="text-foreground-muted text-xs shrink-0" />
      <span className="text-sm text-foreground truncate max-w-[360px]" title={item.relativePath || item.name}>
        {item.relativePath || item.name}
      </span>
      <span className="text-xs text-foreground-muted shrink-0">{formatFileSize(item.size)}</span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="inline-flex items-center justify-center text-foreground-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        <DeleteOutlined className="text-xs" />
      </button>
    </div>
  );
}

export default function ContentEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { text, password, queryPassword, textHistory, files, isDragging, isSending, uploadProgress, showContentInfo } = useCloudStore((state) => ({
    text: state.text,
    password: state.password,
    queryPassword: state.queryPassword,
    textHistory: state.textHistory,
    files: state.files,
    isDragging: state.isDragging,
    isSending: state.isSending,
    uploadProgress: state.uploadProgress,
    showContentInfo: state.showContentInfo
  }));

  const hasFiles = files.length > 0;
  const showProgress = isSending && hasFiles;
  const trimmedText = text.trim();
  const hasText = trimmedText.length > 0;
  const hasInputContent = hasText || hasFiles;
  const isContentInfoVisible = showContentInfo && !!password;
  const showClearButton = hasInputContent || isContentInfoVisible;
  const canShowJsonParseButton = useMemo(() => {
    if (!hasText) return false;

    try {
      JSON.parse(trimmedText);
      return true;
    } catch {
      return false;
    }
  }, [hasText, trimmedText]);

  return (
    <Card
      title="发送内容"
      extra={
        <div className="flex items-center space-x-2">
          <Input
            placeholder="查询密码"
            maxLength={4}
            onChange={(e) => neonCloud.handleQueryPasswordChange(e)}
            value={queryPassword}
            className="h-8 w-[130px]"
            onPressEnter={() => neonCloud.queryMessage()}
          />
          <Button type="primary" onClick={() => neonCloud.queryMessage()}>
            查询
          </Button>
        </div>
      }
      className="w-full"
      styles={{
        body: { padding: '12px' },
        header: { padding: '8px 12px', minHeight: '40px' }
      }}
    >
      {/* 拖拽区域包裹 TextArea */}
      <div
        className="relative"
        onDragEnter={(e) => neonCloud.handleDragEnter(e)}
        onDragOver={(e) => neonCloud.handleDragOver(e)}
        onDragLeave={(e) => neonCloud.handleDragLeave(e)}
        onDrop={(e) => neonCloud.handleDrop(e)}
      >
        <TextArea autoSize={{ minRows: 10, maxRows: 24 }} showCount className="trans-input w-full" allowClear onChange={(e) => neonCloud.handleTextChange(e)} value={text} />

        {/* 拖拽覆盖层 */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary-soft/50 backdrop-blur-[2px] pointer-events-none">
            <InboxOutlined className="text-4xl text-primary mb-2" />
            <span className="text-sm text-primary font-medium">释放以添加文件或文件夹</span>
          </div>
        )}
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center">
            <span className="text-xs text-foreground-muted">
              已选择 {files.length} 个文件，共 {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}
            </span>
          </div>
          <div className="max-h-[160px] overflow-y-auto flex flex-wrap gap-2">
            {files.map((item) => (
              <FileListItem key={item.id} item={item} onRemove={(id) => neonCloud.removeFile(id)} />
            ))}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          onClick={() => neonCloud.sendMessage()}
          disabled={isSending}
          className="send-btn relative h-8 px-5 rounded-lg text-sm font-medium text-white overflow-hidden bg-primary hover:bg-primary-hover disabled:opacity-70 disabled:cursor-not-allowed"
          style={showProgress ? { background: `linear-gradient(90deg, hsl(var(--primary)) ${uploadProgress}%, hsl(var(--border)) ${uploadProgress}%)` } : undefined}
        >
          <span className="relative z-10 flex items-center gap-1.5">
            {isSending ? <LoadingOutlined className="text-xs" /> : <RocketOutlined className="send-icon text-xs" />}
            {isSending ? showProgress ? `${uploadProgress}%` : '发送中...' : <>发送{hasFiles ? ` (${files.length})` : ''}</>}
          </span>
        </button>
        {showClearButton && (
          <Button icon={<ClearOutlined />} onClick={() => neonCloud.clear()}>
            清空
          </Button>
        )}
        {hasText && (
          <Button icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyText()}>
            复制内容
          </Button>
        )}
        {canShowJsonParseButton && (
          <Button icon={<FileTextOutlined />} onClick={() => neonCloud.parseJson()}>
            JSON解析
          </Button>
        )}
        <Button icon={<PaperClipOutlined />} onClick={() => fileInputRef.current?.click()}>
          选择文件
        </Button>
        {textHistory.length > 0 && (
          <Button icon={<HistoryOutlined />} onClick={() => neonCloud.showHistoryModal()}>
            历史记录
          </Button>
        )}
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => neonCloud.handleFileSelect(e)} />
    </Card>
  );
}
