/**
 * 历史记录弹窗组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2025-12-07 23:30:00
 */

import { Modal, Card, Button } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';

export default function HistoryModal() {
  // 直接从 store 获取状态
  const { isHistoryModalOpen, textHistory } = useCloudStore((state) => ({
    isHistoryModalOpen: state.isHistoryModalOpen,
    textHistory: state.textHistory
  }));

  return (
    <Modal title="历史数据" open={isHistoryModalOpen} onCancel={() => neonCloud.closeHistoryModal()} footer={null} width={700} centered>
      <div className="max-h-[70vh] overflow-y-auto py-2">
        {textHistory.length > 0 ? (
          <div className="space-y-4">
            {textHistory.map((item) => (
              <Card
                key={item.timestamp}
                size="small"
                className="group border border-gray-100 hover:border-blue-200 transition-all"
                extra={
                  <div className="flex space-x-2">
                    <Button size="small" type="primary" onClick={() => neonCloud.useHistoryItem(item)}>
                      使用
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => neonCloud.deleteTextHistory(item.timestamp)} />
                    <Button size="small" icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyHistoryText(item.text)} />
                  </div>
                }
              >
                <div className="flex flex-col">
                  <div className="text-xs text-gray-500 mb-2">{new Date(item.timestamp).toLocaleString()}</div>
                  <div className="text-sm line-clamp-5 text-gray-700 whitespace-pre-wrap">{item.text}</div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">暂无历史数据</div>
        )}
      </div>
    </Modal>
  );
}
