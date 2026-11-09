'use client';

import { Input } from '@/components/ui/input';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';

import { QRCode } from '@/components/ui/qrcode';
import { useMessage } from '@/components/ui/message';
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
  const message = useMessage();
  const modal = useConfirm();
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
    centered: true,
    title: '删除这条内容？',
    content: '删除后无法恢复。',
    okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
    async onOk() {
      try {
        await deletePlazaMessage(item.messageId);
        onUnavailable(item.messageId);
        message.success('已删除');
      } catch (error) {
        message.error(error instanceof Error ? error.message : '删除失败，请重试');
        throw error;
      }
    }
  });

  const fileRow = (file: CloudFileInfo) => <div className="plaza-file" key={file.fileId}>
    <PaperClipOutlined className="plaza-file-icon" />
    <div className="plaza-file-info"><span title={file.relativePath || file.fileName}>{file.relativePath || file.fileName}</span><small>{formatBytes(file.fileSize)}</small></div>
    <Button variant="ghost" iconOnly type="button" aria-label={`下载 ${file.fileName}`} title="下载" onClick={() => void download(file)}><DownloadOutlined /></Button>
  </div>;

  return <Card padding="none" bodyWrap={false} className={`cloud-panel plaza-card${detail ? ' plaza-card-detail' : ''}`} aria-label="广场内容" data-message-id={item.messageId}>
    <div className="plaza-card-meta">
      <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{dateTime(item.createdAt)}</time>
    </div>
    {item.content && <div className="plaza-body">
      <div className={`plaza-text${isLong && !expanded ? ' is-collapsed' : ''}`}><LinkifiedText text={item.content} /></div>
      {isLong && !detail && <Button variant="ghost" type="button" className="plaza-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开'}</Button>}
    </div>}
    {previewImages.length > 0 && <div className="plaza-images" data-count={previewImages.length} style={{ '--plaza-image-ratio': singleRatio } as CSSProperties}>
      {previewImages.map(file => <div key={file.fileId} className="plaza-image">
        <div className="rounded-t-lg">
          <ImagePreview images={images} imageId={file.fileId} className="plaza-image-preview" title="广场图片">
            {/* 原图走带过期校验的接口；单张按真实比例展示，多张按方格裁切。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plazaFileUrl(file.fileId, true)} alt={file.fileName} loading="lazy" onLoad={event => {
              if (previewImages.length !== 1) return;
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth && naturalHeight) setSingleRatio(Math.min(16 / 9, Math.max(3 / 4, naturalWidth / naturalHeight)));
            }} onError={() => setBrokenImages(current => new Set([...current, file.fileId]))} />
          </ImagePreview>
        </div>
        {fileRow(file)}
      </div>)}
    </div>}
    {visibleFiles.some(file => !isPreviewImage(file.mimeType) || brokenImages.has(file.fileId)) && <div className="plaza-files">{visibleFiles.filter(file => !isPreviewImage(file.mimeType) || brokenImages.has(file.fileId)).map(fileRow)}</div>}
    {item.files.length > 6 && !detail && <Button variant="ghost" type="button" className="plaza-expand" aria-expanded={allFiles} onClick={() => setAllFiles(!allFiles)}>{allFiles ? '收起' : `全部 ${item.files.length} 个附件`}</Button>}
    <div className="plaza-card-footer">
      <div className="plaza-card-actions">
        {item.content && <Button variant="ghost" size="sm" iconOnly type="button" aria-label="复制内容" onClick={() => void copy(item.content)}><CopyOutlined /></Button>}
        {json.valid && <Button variant="ghost" size="sm" iconOnly type="button" aria-label="JSON 解析" onClick={() => setJsonOpen(true)}><FileTextOutlined /></Button>}
        <Button variant="ghost" size="sm" iconOnly type="button" aria-label="分享" onClick={() => setShareOpen(true)}><ShareAltOutlined /></Button>
      </div>
      <Button variant="ghost" size="sm" iconOnly type="button" aria-label="删除" onClick={remove}><DeleteOutlined /></Button>
    </div>
    <JsonViewerModal open={jsonOpen} value={json.valid ? json.value : undefined} onClose={() => setJsonOpen(false)} onCopy={() => { if (json.valid) void copy(JSON.stringify(json.value, null, 2), 'JSON'); }} />
    <Modal title="分享卡片" open={shareOpen} onCancel={() => setShareOpen(false)} footer={null} centered width={440}>
      <div className="plaza-share-dialog">
        <div className="plaza-qr"><QRCode value={shareUrl} color="#202020" bgColor="#ffffff" size={168} /></div>
        <p>扫码查看</p>
        <div className="plaza-link-row"><Input aria-label="卡片分享链接" prefix={<LinkOutlined />} readOnly value={shareUrl} onFocus={event => event.target.select()} /><Button variant="primary" icon={<CopyOutlined />} onClick={() => void copy(shareUrl, '链接')}>复制链接</Button></div>
        
      </div>
    </Modal>
  </Card>;
}
