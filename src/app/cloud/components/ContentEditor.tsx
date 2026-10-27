/**
 * 内容编辑器组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2026-03-17 18:25:32
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Modal } from 'antd';
import {
  ClearOutlined,
  CopyOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  RocketOutlined,
  LoadingOutlined,
  ExpandOutlined
} from '@ant-design/icons';
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
      <Input placeholder="查询密码" aria-label="查询密码" variant="outlined" maxLength={4}
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
    variant="borderless"
    aria-label={fullScreen ? '展开编辑内容' : '发送内容'}
    placeholder="输入文字、粘贴图片，也可以将文件拖到这里"
    onPaste={event => {
      const images = clipboardImages(event.clipboardData);
      if (!images.length) return;
      event.preventDefault();
      controller.addClipboardImages(images);
    }}
    spellCheck={false}
    showCount={{ formatter: ({ count }) => count >= 200 ? `${count} 字` : null }}
    className="cloud-editor-input w-full"
    styles={{
      textarea: { padding: '14px 40px 32px 16px', lineHeight: 1.75 },
      count: { bottom: 12, insetInlineEnd: 16, fontSize: 12, color: 'hsl(var(--foreground-muted))' }
    }}
    allowClear
    onChange={event => controller.handleTextChange(event)}
    value={text}
  />;
  const dragOverlay = isDragging && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary-soft/50 backdrop-blur-[2px] pointer-events-none">
    <InboxOutlined className="text-4xl text-primary mb-2" />
    <span className="text-sm text-primary font-medium">释放以添加文件或文件夹</span>
  </div>;

  return (
    <section ref={panelRef} aria-labelledby={headingId} className="cloud-panel cloud-editor">
      <div className="cloud-editor-heading">
        <h1 id={headingId} className="text-base font-semibold text-foreground">发送内容</h1>
        <div className="cloud-editor-heading-actions">
          {queryControls}
          {description && <span className="plaza-editor-note">{description}</span>}
          <Button type="text" className="cloud-editor-expand" aria-label="展开编辑" title="展开编辑" icon={<ExpandOutlined />} onClick={openExpanded} />
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
            已选择 {files.length} 个文件，共 {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}
          </span>
          <button type="button" className="cloud-editor-file-toggle" aria-expanded={showFiles} onClick={() => setFilesExpanded(!showFiles)}>{showFiles ? '收起附件' : '展开附件'}</button>
        </div>
        <div className="cloud-editor-file-list" hidden={!showFiles}>
          {files.map((item) => (
            item.type.startsWith('image/') ? <ImageAttachmentDraft key={item.id} file={item.file} onRemove={() => controller.removeFile(item.id)} disabled={isSending} /> : <FileListItem key={item.id} item={item} onRemove={(id) => controller.removeFile(id)} />
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="cloud-editor-toolbar">
        <button
          type="button"
          onClick={() => controller.sendMessage()}
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
          <Button icon={<ClearOutlined />} onClick={() => controller.clear()}>
            清空
          </Button>
        )}
        {hasText && (
          <Button aria-label="复制内容" icon={<CopyOutlined />} onClick={() => controller.handleCopyText()}>
            复制
          </Button>
        )}
        {canShowJsonParseButton && (
          <Button icon={<FileTextOutlined />} onClick={() => controller.parseJson()}>
            JSON解析
          </Button>
        )}
        {showHistoryButton && (
          <Button icon={<HistoryOutlined />} onClick={() => controller.showHistoryModal()}>
            历史
          </Button>
        )}
      </div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => controller.handleFileSelect(e)} />
      <Modal
        title="展开编辑"
        open={expanded}
        onCancel={closeExpanded}
        footer={<div className="cloud-expanded-footer"><span>{hasFiles ? `已选择 ${files.length} 个附件，完成编辑后可发送` : ''}</span><Button type="primary" onClick={closeExpanded}>完成编辑</Button></div>}
        width={1120}
        rootClassName="cloud-expanded-root"
        className="cloud-expanded-dialog"
        style={{ top: layout.viewportTop + 16, paddingBottom: 0, maxWidth: 'calc(100vw - 32px)' }}
        styles={{ container: { height: Math.max(160, layout.viewportHeight - 32), display: 'flex', flexDirection: 'column' }, body: { flex: 1, minHeight: 0, display: 'flex' } }}
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
    </section>
  );
}
