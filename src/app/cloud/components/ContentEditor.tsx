import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
/**
 * 内容编辑器组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2026-03-17 18:25:32
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import { useCloudStore, FileItem } from '../store';
import { neonCloud, type NeonCloud } from '../core';
import LinkTextArea from './LinkTextArea';
import { clipboardImages } from '@/lib/clipboardImages';
import { ImageAttachmentDraft } from '@/components/image-viewer/ImageAttachmentDraft';
import { useEditorLayout } from './useEditorLayout';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function FileListItem({ item, onRemove }: { item: FileItem; onRemove: (id: string) => void }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-2 rounded-md bg-surface-inset px-3 py-1.5 max-w-full">
      <Icon name="paperclip" className="text-foreground-muted text-xs shrink-0" />
      <span className="text-sm text-foreground truncate max-w-[360px]" title={item.relativePath || item.name}>
        {item.relativePath || item.name}
      </span>
      <span className="text-xs text-foreground-muted shrink-0">{formatFileSize(item.size)}</span>
      <Tooltip title={`移除 ${item.name}`}><Button variant="ghost"
        size="sm" iconOnly
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`移除 ${item.name}`}
      >
        <Icon name="trash" className="text-xs" />
      </Button></Tooltip>
    </div>
  );
}

export default function ContentEditor() {
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

  return <ContentEditorView
    controller={neonCloud}
    text={text} files={files} isDragging={isDragging} isSending={isSending} uploadProgress={uploadProgress}
    showClearButton={!!text.trim() || files.length > 0 || (showContentInfo && !!password)}
    showHistoryButton={textHistory.length > 0}
    queryControls={<div className="cloud-query-controls">
      <Input placeholder="查询密码" aria-label="查询密码" maxLength={4}
        onChange={(e) => neonCloud.handleQueryPasswordChange(e)} value={queryPassword} className="cloud-query-input"
        onPressEnter={() => neonCloud.queryMessage()} />
      <Button onClick={() => neonCloud.queryMessage()} className="cloud-query-button">查询</Button>
    </div>}
  />;
}

export type EditorController = Pick<NeonCloud,
  'handleTextChange' | 'handleDragEnter' | 'handleDragOver' | 'handleDragLeave' | 'handleDrop' |
  'addClipboardImages' | 'removeFile' | 'handleFileSelect' | 'sendMessage' | 'clear' |
  'handleCopyText' | 'parseJson' | 'showHistoryModal'>;

type EditorProps = {
  controller: EditorController;
  text: string;
  files: FileItem[];
  isDragging: boolean;
  isSending: boolean;
  uploadProgress: number;
  showClearButton: boolean;
  showHistoryButton: boolean;
  queryControls?: ReactNode;
  description?: string;
};

/** Shared writing surface; each destination retains its own state and send behavior. */
export function ContentEditorView({ controller, text, files, isDragging, isSending, uploadProgress, showClearButton, showHistoryButton, queryControls, description }: EditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef({ start: 0, end: 0, scrollTop: 0 });
  const [expanded, setExpanded] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState<boolean | null>(null);
  const layout = useEditorLayout(panelRef);
  const headingId = useId();

  const hasFiles = files.length > 0;
  const showProgress = isSending && hasFiles;
  const trimmedText = text.trim();
  const hasText = trimmedText.length > 0;
  const showFiles = filesExpanded ?? (!layout.compact && files.length <= 3);
  useEffect(() => { setFilesExpanded(null); }, [layout.compact]);
  const canShowJsonParseButton = useMemo(() => {
    if (!hasText) return false;

    try {
      JSON.parse(trimmedText);
      return true;
    } catch {
      return false;
    }
  }, [hasText, trimmedText]);

  const rememberSelection = (input: HTMLTextAreaElement | null | undefined) => {
    if (input) selectionRef.current = { start: input.selectionStart, end: input.selectionEnd, scrollTop: input.scrollTop };
  };
  const openExpanded = () => {
    rememberSelection(panelRef.current?.querySelector('textarea'));
    setExpanded(true);
  };
  const closeExpanded = () => {
    rememberSelection(expandedRef.current?.querySelector('textarea'));
    setExpanded(false);
  };
  const restoreSelection = useCallback((input: HTMLTextAreaElement | null | undefined) => {
    if (!input) return;
    const { start, end, scrollTop } = selectionRef.current;
    input.focus({ preventScroll: true });
    input.setSelectionRange(start, end);
    input.scrollTop = scrollTop;
    input.dispatchEvent(new Event('scroll'));
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => restoreSelection(expandedRef.current?.querySelector('textarea')));
    return () => cancelAnimationFrame(frame);
  }, [expanded, restoreSelection]);
  const renderInput = (fullScreen = false) => <LinkTextArea
    autoSize={fullScreen ? false : { minRows: layout.minRows, maxRows: layout.maxRows }}
    aria-label={fullScreen ? '展开编辑内容' : '发送内容'}
    placeholder="输入内容，或拖入文件"
    onKeyDown={event => {
      // 普通换行仍用 Enter；Shift+Enter 直接发送，输入法组字过程中不触发。
      if (event.key !== 'Enter' || !event.shiftKey || event.repeat || event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (!isSending) void controller.sendMessage();
    }}
    onPaste={event => {
      const images = clipboardImages(event.clipboardData);
      if (!images.length) return;
      event.preventDefault();
      controller.addClipboardImages(images);
    }}
    spellCheck={false}
    showCount={{ formatter: ({ count }) => count >= 200 ? `${count} 字` : null }}
    className="cloud-editor-input w-full"
    allowClear
    onChange={event => controller.handleTextChange(event)}
    value={text}
  />;
  const dragOverlay = isDragging && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary-soft/50 backdrop-blur-[2px] pointer-events-none">
    <Icon name="inbox" className="text-4xl text-primary mb-2" />
    <span className="text-sm text-primary font-medium">松开添加文件</span>
  </div>;

  return (
    <Card as="section" ref={panelRef} padding="none" bodyWrap={false} aria-labelledby={headingId} className="cloud-panel cloud-editor">
      <div className="cloud-editor-heading">
        <h1 id={headingId} className="text-body font-semibold text-foreground">发送内容</h1>
        <div className="cloud-editor-heading-actions">
          {queryControls}
          {description && <span className="plaza-editor-note">{description}</span>}
          <Tooltip title="展开编辑"><Button variant="ghost" className="cloud-editor-expand" aria-label="展开编辑" icon={<Icon name="expand" />} onClick={openExpanded} /></Tooltip>
        </div>
      </div>
      {/* 拖拽区域包裹 TextArea */}
      <div
        className="cloud-editor-surface relative"
        onDragEnter={(e) => controller.handleDragEnter(e)}
        onDragOver={(e) => controller.handleDragOver(e)}
        onDragLeave={(e) => controller.handleDragLeave(e)}
        onDrop={(e) => controller.handleDrop(e)}
      >
        {renderInput()}

        {/* 拖拽覆盖层 */}
        {dragOverlay}
      </div>

      {/* 文件列表 */}
      <div className="cloud-editor-attachments" hidden={!hasFiles}>
        <div className="cloud-editor-file-summary">
          <span className="text-xs text-foreground-muted">
            {files.length} 个文件 · {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}
          </span>
          <Button variant="ghost" size="sm" type="button" aria-expanded={showFiles} onClick={() => setFilesExpanded(!showFiles)}>{showFiles ? '收起' : '展开'}</Button>
        </div>
        <div className="cloud-editor-file-list" hidden={!showFiles}>
          {files.map((item) => (
            item.type.startsWith('image/') ? <ImageAttachmentDraft key={item.id} file={item.file} onRemove={() => controller.removeFile(item.id)} disabled={isSending} /> : <FileListItem key={item.id} item={item} onRemove={(id) => controller.removeFile(id)} />
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="cloud-editor-toolbar">
        <Button variant="primary"
          type="button"
          onClick={() => controller.sendMessage()}
          loading={isSending}
          icon={<Icon name="rocket" />}
          className="cloud-send-button"
        >
          {isSending ? showProgress ? `${uploadProgress}%` : '发送中...' : <>发送{hasFiles ? ` (${files.length})` : ''}</>}
        </Button>
        <Tooltip title="选择文件"><Button aria-label="选择文件" icon={<Icon name="paperclip" />} onClick={() => fileInputRef.current?.click()} /></Tooltip>
        {showClearButton && (
          <Tooltip title="清空"><Button aria-label="清空" icon={<Icon name="clear" />} onClick={() => controller.clear()} /></Tooltip>
        )}
        {hasText && (
          <Tooltip title="复制内容"><Button aria-label="复制内容" icon={<Icon name="copy" />} onClick={() => controller.handleCopyText()} /></Tooltip>
        )}
        {canShowJsonParseButton && (
          <Tooltip title="JSON解析"><Button aria-label="JSON解析" icon={<Icon name="file-text" />} onClick={() => controller.parseJson()} /></Tooltip>
        )}
        {showHistoryButton && (
          <Tooltip title="历史"><Button aria-label="历史" icon={<Icon name="history" />} onClick={() => controller.showHistoryModal()} /></Tooltip>
        )}
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => controller.handleFileSelect(e)} />
      <Modal
        title="展开编辑"
        open={expanded}
        onCancel={closeExpanded}
        footer={<div className="cloud-expanded-footer"><span>{hasFiles ? `${files.length} 个附件` : ''}</span><Button variant="primary" onClick={closeExpanded}>完成编辑</Button></div>}
        width={1120}
        rootClassName="cloud-expanded-root"
        className="cloud-expanded-dialog"
        styles={{ body: { flex: 1, minHeight: 0, display: 'flex' } }}
        focusable={{ focusTriggerAfterClose: false }}
        destroyOnHidden
        afterOpenChange={open => { if (!open) restoreSelection(panelRef.current?.querySelector('textarea')); }}
      >
        <div ref={expandedRef} className="cloud-editor-surface cloud-expanded-surface"
          onDragEnter={event => controller.handleDragEnter(event)}
          onDragOver={event => controller.handleDragOver(event)}
          onDragLeave={event => controller.handleDragLeave(event)}
          onDrop={event => controller.handleDrop(event)}>
          {renderInput(true)}
          {dragOverlay}
        </div>
      </Modal>
    </Card>
  );
}
