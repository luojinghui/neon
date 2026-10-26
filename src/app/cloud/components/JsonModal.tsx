/**
 * JSON 格式化弹窗组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2025-12-07 23:30:00
 */

import { Modal, Button, Space } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import JsonView from '@uiw/react-json-view';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';

export default function JsonModal() {
  // 直接从 store 获取状态
  const { isJsonModalOpen, jsonObject } = useCloudStore((state) => ({
    isJsonModalOpen: state.isJsonModalOpen,
    jsonObject: state.jsonObject
  }));

  return <JsonViewerModal open={isJsonModalOpen} value={jsonObject} onClose={() => neonCloud.closeJsonModal()} onCopy={() => neonCloud.handleCopyFormattedJson()} />;
}

export function JsonViewerModal({ open, value, onClose, onCopy }: { open: boolean; value: unknown; onClose: () => void; onCopy: () => void }) {

  return (
    <Modal
      title="JSON格式化"
      open={open}
      onCancel={onClose}
      footer={[
        <Space key="footer">
          <Button key="copy" icon={<CopyOutlined />} onClick={onCopy}>
            复制JSON
          </Button>
          <Button key="close" type="text" onClick={onClose}>
            关闭
          </Button>
        </Space>
      ]}
      width={900}
      centered
    >
      <div className="max-h-[70vh] overflow-y-auto">
          <div className="space-y-4">
            <div className="cloud-json-view select-text rounded-lg p-4 [&_*]:select-text">
              {typeof value === 'object' && value !== null ? <JsonView
                value={value}
                displayDataTypes={false}
                enableClipboard={true}
                beforeCopy={(copyText, _keyName, value) => (typeof value === 'string' ? value : copyText)}
                collapsed={false}
                shortenTextAfterLength={99999}
                displayObjectSize={true}
                style={{ fontSize: '13px', backgroundColor: 'transparent' }}
              /> : <pre className="whitespace-pre-wrap break-all text-sm">{JSON.stringify(value, null, 2)}</pre>}
            </div>
          </div>
      </div>
    </Modal>
  );
}
