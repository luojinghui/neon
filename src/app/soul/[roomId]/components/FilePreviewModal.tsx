'use client';

import { FileTextOutlined, LoadingOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import mammoth from 'mammoth';
import { useEffect, useMemo, useState } from 'react';
import type { ChatAttachment } from '../../core/types';

type PreviewKind = 'pdf' | 'text' | 'docx' | 'unsupported';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'csv', 'log', 'xml', 'yaml', 'yml', 'ini', 'conf', 'css', 'scss', 'less', 'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'sql', 'sh']);

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

function getPreviewKind(attachment: ChatAttachment): PreviewKind {
  const extension = extensionOf(attachment.name);
  const mimeType = attachment.mimeType.toLowerCase();
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (extension === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (TEXT_EXTENSIONS.has(extension) || mimeType.startsWith('text/')) return 'text';
  return 'unsupported';
}

function sanitizeDocumentHtml(html: string): string {
  const documentNode = new DOMParser().parseFromString(html, 'text/html');
  documentNode.querySelectorAll('script, style, iframe, object, embed, form, link, meta').forEach((node) => node.remove());
  documentNode.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const value = attribute.value.trim();
      if (/^on/i.test(attribute.name) || ((attribute.name === 'href' || attribute.name === 'src') && /^(javascript|vbscript|data:text\/html)/i.test(value))) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noreferrer noopener');
    }
  });
  return documentNode.body.innerHTML;
}

interface FilePreviewModalProps {
  attachment?: ChatAttachment;
  open: boolean;
  onClose: () => void;
}

export function FilePreviewModal({ attachment, open, onClose }: FilePreviewModalProps) {
  const kind = useMemo(() => (attachment ? getPreviewKind(attachment) : 'unsupported'), [attachment]);
  const previewTitle = attachment?.name || '文件预览';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [textContent, setTextContent] = useState('');
  const [documentHtml, setDocumentHtml] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!open || !attachment) return;
    let active = true;
    let localObjectUrl = '';

    setLoading(true);
    setError('');
    setTextContent('');
    setDocumentHtml('');
    setPreviewUrl('');

    const loadPreview = async () => {
      try {
        if (kind === 'unsupported') throw new Error('该文件类型暂不支持在线预览，可通过消息右侧的更多菜单下载');

        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error('文件读取失败，请稍后重试');
        const arrayBuffer = await response.arrayBuffer();
        if (!active) return;

        if (kind === 'pdf') {
          localObjectUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: 'application/pdf' }));
          setPreviewUrl(localObjectUrl);
        } else if (kind === 'text') {
          setTextContent(new TextDecoder('utf-8').decode(arrayBuffer));
        } else if (kind === 'docx') {
          const result = await mammoth.convertToHtml({ arrayBuffer }, { convertImage: mammoth.images.dataUri });
          if (active) setDocumentHtml(sanitizeDocumentHtml(result.value));
        }
      } catch (previewError) {
        if (active) setError(previewError instanceof Error ? previewError.message : '文件预览失败');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPreview();
    return () => {
      active = false;
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [attachment, kind, open]);

  return (
    <Modal
      rootClassName="soul-file-preview-modal"
      title={
        <span className="soul-file-preview-title" title={previewTitle}>
          {previewTitle}
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={900}
      destroyOnHidden
    >
      <div className="soul-file-preview-body flex h-[min(72vh,760px)] min-h-80 overflow-hidden bg-transparent">
        {loading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-foreground-muted">
            <LoadingOutlined /> 正在加载预览…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <FileTextOutlined className="mb-3 text-3xl text-foreground-muted" />
            <div className="text-sm text-foreground-secondary">{error}</div>
          </div>
        )}

        {!loading && !error && previewUrl && <iframe title={attachment?.name || '文件预览'} src={previewUrl} className="h-full w-full border-0 bg-white" />}

        {!loading && !error && textContent && <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-5 text-sm leading-6 text-foreground">{textContent}</pre>}

        {!loading && !error && documentHtml && <article className="docx-preview h-full w-full overflow-auto bg-white p-6 text-neutral-900" dangerouslySetInnerHTML={{ __html: documentHtml }} />}
      </div>
    </Modal>
  );
}
