'use client';

import { App, Button, Modal } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { ContentEditorView, type EditorController } from '../components/ContentEditor';
import { createFileItem, droppedFiles } from '../attachments';
import { copyShareCode } from '../clipboard';
import { JsonViewerModal } from '../components/JsonModal';
import { sendPlaza } from './client';
import { parseJson } from './types';
import { usePlazaStore, setPlazaText, readPlazaHistory, savePlazaHistory, addPlazaMessage } from './store';

export default function PlazaEditor() {
  const state = usePlazaStore();
  const { message } = App.useApp();
  const [json, setJson] = useState<{ value: unknown } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(readPlazaHistory, []);

  const copy = async (text: string) => {
    if (await copyShareCode(text)) message.success('内容已复制');
    else message.warning('复制失败，请选择内容后手动复制');
  };

  const controller: EditorController = {
    handleTextChange: event => setPlazaText(event.target.value),
    handleDragEnter: event => { event.preventDefault(); event.stopPropagation(); usePlazaStore.setState({ isDragging: true }); },
    handleDragOver: event => { event.preventDefault(); event.stopPropagation(); },
    handleDragLeave: event => {
      event.preventDefault(); event.stopPropagation();
      if (!event.currentTarget.contains(event.relatedTarget as Node)) usePlazaStore.setState({ isDragging: false });
    },
    handleDrop: async event => {
      event.preventDefault(); event.stopPropagation(); usePlazaStore.setState({ isDragging: false });
      try {
        const files = await droppedFiles(event.dataTransfer);
        usePlazaStore.setState(current => ({ files: [...current.files, ...files] }));
      } catch { message.error('文件读取失败，请重新选择'); }
    },
    addClipboardImages: files => { usePlazaStore.setState(current => ({ files: [...current.files, ...files.map(file => createFileItem(file))] })); },
    removeFile: id => { usePlazaStore.setState(current => ({ files: current.files.filter(file => file.id !== id) })); },
    handleFileSelect: event => {
      const files = Array.from(event.target.files || []).map(file => createFileItem(file));
      usePlazaStore.setState(current => ({ files: [...current.files, ...files] }));
      event.target.value = '';
    },
    clear: () => { setPlazaText(''); usePlazaStore.setState({ files: [], isDragging: false }); },
    handleCopyText: () => { void copy(usePlazaStore.getState().text); },
    parseJson: () => { const parsed = parseJson(usePlazaStore.getState().text); if (parsed.valid) setJson({ value: parsed.value }); },
    showHistoryModal: () => setHistoryOpen(true),
    sendMessage: async () => {
      const snapshot = usePlazaStore.getState();
      if (snapshot.isSending) return;
      if (!snapshot.text.trim() && !snapshot.files.length) { message.warning('请输入内容或选择文件'); return; }
      usePlazaStore.setState({ isSending: true, uploadProgress: 0 });
      try {
        const result = await sendPlaza(snapshot.text, snapshot.files, progress => usePlazaStore.setState({ uploadProgress: progress }));
        addPlazaMessage(result.item, result.serverNow);
        const sentIds = new Set(snapshot.files.map(file => file.id));
        usePlazaStore.setState(current => ({ text: current.revision === snapshot.revision ? '' : current.text, files: current.files.filter(file => !sentIds.has(file.id)) }));
        if (snapshot.text.trim()) savePlazaHistory([{ text: snapshot.text, timestamp: Date.now() }, ...usePlazaStore.getState().textHistory].slice(0, 20));
        message.success('已发布到广场');
      } catch (error) { message.error(error instanceof Error ? error.message : '发送失败，请重试'); }
      finally { usePlazaStore.setState({ isSending: false, uploadProgress: 0 }); }
    }
  };

  return <>
    <ContentEditorView controller={controller} text={state.text} files={state.files} isDragging={state.isDragging}
      isSending={state.isSending} uploadProgress={state.uploadProgress} showClearButton={!!state.text || state.files.length > 0}
      showHistoryButton={state.textHistory.length > 0} description="公开可见 · 保留 48 小时" />
    <JsonViewerModal open={json !== null} value={json?.value} onClose={() => setJson(null)} onCopy={() => void copy(JSON.stringify(json?.value, null, 2))} />
    <Modal title="输入历史" open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={640}>
      <div className="plaza-history">
        {state.textHistory.map(item => <div key={item.timestamp} className="plaza-history-item">
          <div className="flex items-center justify-between gap-2"><time className="text-xs text-foreground-muted">{new Date(item.timestamp).toLocaleString()}</time><div>
            <Button type="text" size="small" aria-label="复制历史内容" icon={<CopyOutlined />} onClick={() => void copy(item.text)} />
            <Button type="text" size="small" aria-label="删除历史记录" icon={<DeleteOutlined />} onClick={() => savePlazaHistory(state.textHistory.filter(current => current.timestamp !== item.timestamp))} />
          </div></div>
          <p className="my-2 line-clamp-4 whitespace-pre-wrap break-all text-sm">{item.text}</p>
          <Button type="link" size="small" onClick={() => { setPlazaText(item.text); setHistoryOpen(false); }}>使用此内容</Button>
        </div>)}
        {!state.textHistory.length && <p className="py-8 text-center text-sm text-foreground-muted">暂无历史记录</p>}
      </div>
    </Modal>
  </>;
}
