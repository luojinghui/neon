'use client';

import { App, Button, Input, Modal, QRCode } from 'antd';
import { CopyOutlined, DeleteOutlined, DownloadOutlined, FileTextOutlined, LinkOutlined, PaperClipOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ImagePreview } from '@/components/image-viewer/ImagePreview';
import LinkifiedText from '../components/LinkifiedText';
import { JsonViewerModal } from '../components/JsonModal';
import { copyShareCode } from '../clipboard';
import { deletePlazaMessage, getPlazaMessage, PlazaClientError } from './client';
import { formatBytes, isPreviewImage, parseJson, plazaFileUrl, plazaSharePath, type PlazaMessage } from './types';
import type { CloudFileInfo } from '@/action';

type Props = { item: PlazaMessage; detail?: boolean; clockOffset: number; onUnavailable: (id: string) => void };
const dateTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

export default function PlazaCard({ item, detail = false, clockOffset, onUnavailable }: Props) {
  const { message, modal } = App.useApp();
  const [expanded, setExpanded] = useState(detail);
  const [allFiles, setAllFiles] = useState(detail);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [singleRatio, setSingleRatio] = useState(4 / 3);
  const json = useMemo(() => parseJson(item.content), [item.content]);
  const isLong = item.content.length > 1000 || item.content.split('\n').length > 12;
  const visibleFiles = allFiles ? item.files : item.files.slice(0, 6);
  const images = item.files.filter(file => isPreviewImage(file.mimeType)).map(file => ({ id: file.fileId, url: plazaFileUrl(file.fileId, true), name: file.fileName }));
  const previewImages = visibleFiles.filter(file => isPreviewImage(file.mimeType) && !brokenImages.has(file.fileId));
  const shareUrl = typeof window === 'undefined' ? plazaSharePath(item.messageId) : new URL(plazaSharePath(item.messageId), window.location.origin).href;

  useEffect(() => {
    const remaining = Date.parse(item.expireAt) - (Date.now() + clockOffset);
    const timer = window.setTimeout(() => onUnavailable(item.messageId), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [item.messageId, item.expireAt, clockOffset, onUnavailable]);

  const copy = async (text: string, label = '内容') => {
    if (await copyShareCode(text)) message.success(`${label}已复制`);
    else message.warning('复制失败，请选择内容后手动复制');
  };

  const download = async (file: CloudFileInfo) => {
    try {
      await getPlazaMessage(item.messageId);
      const anchor = document.createElement('a');
      anchor.href = plazaFileUrl(file.fileId);
      anchor.download = file.fileName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } catch (error) {
      if (error instanceof PlazaClientError && error.status === 404) onUnavailable(item.messageId);
      message.error(error instanceof Error ? error.message : '下载失败，请重试');
    }
  };

  const remove = () => modal.confirm({
    title: '删除这张卡片？',
    content: '删除后所有人将无法继续查看，附件和分享链接也会失效。',
    okText: '删除卡片', cancelText: '取消', okButtonProps: { danger: true },
    async onOk() {
      try {
        await deletePlazaMessage(item.messageId);
        onUnavailable(item.messageId);
        message.success('卡片已删除');
      } catch (error) {
        message.error(error instanceof Error ? error.message : '删除失败，请重试');
        throw error;
      }
    }
  });

  const fileRow = (file: CloudFileInfo) => <div className="plaza-file" key={file.fileId}>
    <PaperClipOutlined className="plaza-file-icon" />
    <div className="plaza-file-info"><span title={file.relativePath || file.fileName}>{file.relativePath || file.fileName}</span><small>{formatBytes(file.fileSize)}</small></div>
    <button type="button" className="plaza-icon-button" aria-label={`下载 ${file.fileName}`} title="下载" onClick={() => void download(file)}><DownloadOutlined /></button>
  </div>;

  return <article className={`cloud-panel plaza-card${detail ? ' plaza-card-detail' : ''}`} aria-label="广场内容" data-message-id={item.messageId}>
    <div className="plaza-card-meta">
      <time dateTime={item.createdAt} title={`发布于 ${new Date(item.createdAt).toLocaleString()}`}>{dateTime(item.createdAt)}</time>
      <time dateTime={item.expireAt} title="发布后 48 小时自动失效">{dateTime(item.expireAt)} 到期</time>
    </div>
    {item.content && <div className="plaza-body">
      <div className={`plaza-text${isLong && !expanded ? ' is-collapsed' : ''}`}><LinkifiedText text={item.content} /></div>
      {isLong && !detail && <button type="button" className="plaza-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起正文' : '展开全文'}</button>}
    </div>}
    {previewImages.length > 0 && <div className="plaza-images" data-count={previewImages.length} style={{ '--plaza-image-ratio': singleRatio } as CSSProperties}>
      {previewImages.map(file => <div key={file.fileId} className="plaza-image">
        <ImagePreview images={images} imageId={file.fileId} className="plaza-image-preview" title="广场图片">
          {/* 原图走带过期校验的接口；单张按真实比例展示，多张按方格裁切。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plazaFileUrl(file.fileId, true)} alt={file.fileName} loading="lazy" onLoad={event => {
            if (previewImages.length !== 1) return;
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setSingleRatio(Math.min(16 / 9, Math.max(3 / 4, naturalWidth / naturalHeight)));
          }} onError={() => setBrokenImages(current => new Set([...current, file.fileId]))} />
        </ImagePreview>
        {fileRow(file)}
      </div>)}
    </div>}
    {visibleFiles.some(file => !isPreviewImage(file.mimeType) || brokenImages.has(file.fileId)) && <div className="plaza-files">{visibleFiles.filter(file => !isPreviewImage(file.mimeType) || brokenImages.has(file.fileId)).map(fileRow)}</div>}
    {item.files.length > 6 && !detail && <button type="button" className="plaza-expand" aria-expanded={allFiles} onClick={() => setAllFiles(!allFiles)}>{allFiles ? '收起附件' : `查看全部 ${item.files.length} 个附件`}</button>}
    <div className="plaza-card-footer">
      <div className="plaza-card-actions">
        {item.content && <button type="button" onClick={() => void copy(item.content)}><CopyOutlined /><span>复制</span></button>}
        {json.valid && <button type="button" onClick={() => setJsonOpen(true)}><FileTextOutlined /><span>JSON 解析</span></button>}
        <button type="button" onClick={() => setShareOpen(true)}><ShareAltOutlined /><span>分享</span></button>
      </div>
      <button type="button" className="plaza-icon-button plaza-delete" aria-label="删除卡片" title="删除卡片" onClick={remove}><DeleteOutlined /></button>
    </div>
    <JsonViewerModal open={jsonOpen} value={json.valid ? json.value : undefined} onClose={() => setJsonOpen(false)} onCopy={() => { if (json.valid) void copy(JSON.stringify(json.value, null, 2), 'JSON'); }} />
    <Modal title="分享卡片" open={shareOpen} onCancel={() => setShareOpen(false)} footer={null} centered width={440}>
      <div className="plaza-share-dialog">
        <div className="plaza-qr"><QRCode value={shareUrl} color="#202020" bgColor="#ffffff" size={168} bordered={false} /></div>
        <p>扫描二维码，直接查看这张卡片</p>
        <div className="plaza-link-row"><Input aria-label="卡片分享链接" prefix={<LinkOutlined />} readOnly value={shareUrl} onFocus={event => event.target.select()} /><Button type="primary" icon={<CopyOutlined />} onClick={() => void copy(shareUrl, '链接')}>复制链接</Button></div>
        <small>有效至 {new Date(item.expireAt).toLocaleString()} · 删除后链接失效</small>
      </div>
    </Modal>
  </article>;
}
