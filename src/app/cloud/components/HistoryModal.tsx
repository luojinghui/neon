/**
 * 历史记录弹窗组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2026-03-17 18:30:00
 */

import { Modal } from 'antd';
import { CopyOutlined, DeleteOutlined, HistoryOutlined, SendOutlined } from '@ant-design/icons';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';

function HistoryItem({ item }: { item: { text: string; timestamp: number } }) {
  return (
    <div className="group rounded-lg border border-border bg-surface hover:border-primary/40 transition-all">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-foreground-muted">{new Date(item.timestamp).toLocaleString()}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => neonCloud.handleCopyHistoryText(item.text)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <CopyOutlined className="text-[10px]" />
            复制
          </button>
          <button
            onClick={() => neonCloud.deleteTextHistory(item.timestamp)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-foreground-muted hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <DeleteOutlined className="text-[10px]" />
            删除
          </button>
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm text-foreground leading-relaxed line-clamp-4 whitespace-pre-wrap">{item.text}</div>
      </div>
      <div className="px-3 pb-2">
        <button
          onClick={() => neonCloud.useHistoryItem(item)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
        >
          <SendOutlined className="text-[10px]" />
          使用此内容
        </button>
      </div>
    </div>
  );
}

export default function HistoryModal() {
  const { isHistoryModalOpen, textHistory } = useCloudStore((state) => ({
    isHistoryModalOpen: state.isHistoryModalOpen,
    textHistory: state.textHistory
  }));

  return (
    <Modal title="历史数据" open={isHistoryModalOpen} onCancel={() => neonCloud.closeHistoryModal()} footer={null} width={640} centered>
      <div className="max-h-[70vh] overflow-y-auto py-2">
        {textHistory.length > 0 ? (
          <div className="space-y-3">
            {textHistory.map((item) => (
              <HistoryItem key={item.timestamp} item={item} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-foreground-muted">
            <HistoryOutlined className="text-3xl mb-3 opacity-40" />
            <span className="text-sm">暂无历史数据</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
