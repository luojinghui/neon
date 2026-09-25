/**
 * 内容编辑器组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2026-03-17 18:25:32
 */

import { useMemo, useRef } from 'react';
import { Button, Input } from 'antd';
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
import LinkTextArea from './LinkTextArea';
import { clipboardImages } from '@/lib/clipboardImages';
import { ImageAttachmentDraft } from '@/components/image-viewer/ImageAttachmentDraft';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function FileListItem({ item, onRemove }: { item: FileItem; onRemove: (id: string) => void }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-2 rounded-lg bg-background-secondary px-3 py-1.5 max-w-full">
      <PaperClipOutlined className="text-foreground-muted text-xs shrink-0" />
      <span className="text-sm text-foreground truncate max-w-[360px]" title={item.relativePath || item.name}>
        {item.relativePath || item.name}
      </span>
      <span className="text-xs text-foreground-muted shrink-0">{formatFileSize(item.size)}</span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`移除 ${item.name}`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-muted hover:bg-danger-soft hover:text-danger transition-colors shrink-0"
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
    <section aria-labelledby="cloud-editor-heading" className="cloud-panel cloud-editor">
      <div className="cloud-editor-heading">
        <h1 id="cloud-editor-heading" className="text-base font-semibold text-foreground">发送内容</h1>
        <div className="cloud-query-controls">
          <Input
            placeholder="查询密码"
            aria-label="查询密码"
            variant="outlined"
            maxLength={4}
            onChange={(e) => neonCloud.handleQueryPasswordChange(e)}
            value={queryPassword}
            className="cloud-query-input"
            onPressEnter={() => neonCloud.queryMessage()}
          />
          <Button onClick={() => neonCloud.queryMessage()} className="cloud-query-button">
            查询
          </Button>
        </div>
      </div>
      {/* 拖拽区域包裹 TextArea */}
      <div
        className="cloud-editor-surface relative"
        onDragEnter={(e) => neonCloud.handleDragEnter(e)}
        onDragOver={(e) => neonCloud.handleDragOver(e)}
        onDragLeave={(e) => neonCloud.handleDragLeave(e)}
        onDrop={(e) => neonCloud.handleDrop(e)}
      >
        <LinkTextArea
          autoSize={{ minRows: 6, maxRows: 22 }}
          variant="borderless"
          aria-label="发送内容"
          placeholder="输入文字、粘贴图片，也可以将文件拖到这里"
          onPaste={event => {
            const images = clipboardImages(event.clipboardData);
            if (!images.length) return;
            event.preventDefault();
            neonCloud.addClipboardImages(images);
          }}
          spellCheck={false}
          showCount={{ formatter: ({ count }) => `${count} 字` }}
          className="cloud-editor-input w-full"
          styles={{
            textarea: { padding: '14px 40px 32px 16px', lineHeight: 1.75 },
            count: { bottom: 12, insetInlineEnd: 16, fontSize: 12, color: 'hsl(var(--foreground-muted))' }
          }}
          allowClear
          onChange={(e) => neonCloud.handleTextChange(e)}
          value={text}
        />

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
              item.type.startsWith('image/') ? <ImageAttachmentDraft key={item.id} file={item.file} onRemove={() => neonCloud.removeFile(item.id)} disabled={isSending} /> : <FileListItem key={item.id} item={item} onRemove={(id) => neonCloud.removeFile(id)} />
            ))}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="cloud-editor-toolbar">
        <button
          type="button"
          onClick={() => neonCloud.sendMessage()}
          disabled={isSending}
          className="send-btn cloud-send-button relative inline-flex h-9 min-w-24 shrink-0 items-center justify-center px-5 rounded-lg text-sm font-medium text-white overflow-hidden bg-primary hover:bg-primary-hover disabled:opacity-70 disabled:cursor-not-allowed"
          style={showProgress ? { background: `linear-gradient(90deg, hsl(var(--primary)) ${uploadProgress}%, hsl(var(--border)) ${uploadProgress}%)` } : undefined}
        >
          <span className="relative z-10 flex items-center gap-1.5">
            {isSending ? <LoadingOutlined className="text-xs" /> : <RocketOutlined className="send-icon text-xs" />}
            {isSending ? showProgress ? `${uploadProgress}%` : '发送中...' : <>发送{hasFiles ? ` (${files.length})` : ''}</>}
          </span>
        </button>
        <Button icon={<PaperClipOutlined />} onClick={() => fileInputRef.current?.click()}>
          文件
        </Button>
        {showClearButton && (
          <Button icon={<ClearOutlined />} onClick={() => neonCloud.clear()}>
            清空
          </Button>
        )}
        {hasText && (
          <Button aria-label="复制内容" icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyText()}>
            复制
          </Button>
        )}
        {canShowJsonParseButton && (
          <Button icon={<FileTextOutlined />} onClick={() => neonCloud.parseJson()}>
            JSON解析
          </Button>
        )}
        {textHistory.length > 0 && (
          <Button icon={<HistoryOutlined />} onClick={() => neonCloud.showHistoryModal()}>
            历史
          </Button>
        )}
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => neonCloud.handleFileSelect(e)} />
    </section>
  );
}
