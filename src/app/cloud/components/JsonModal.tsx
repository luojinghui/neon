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

  return (
    <Modal
      title="JSON格式化"
      open={isJsonModalOpen}
      onCancel={() => neonCloud.closeJsonModal()}
      footer={[
        <Space key="footer">
          <Button key="copy" icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyFormattedJson()}>
            复制JSON
          </Button>
          <Button key="close" onClick={() => neonCloud.closeJsonModal()}>
            关闭
          </Button>
        </Space>
      ]}
      width={900}
      centered
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {jsonObject && (
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              <JsonView
                value={jsonObject}
                displayDataTypes={false}
                enableClipboard={true}
                collapsed={false}
                shortenTextAfterLength={99999}
                displayObjectSize={true}
                style={{ fontSize: '13px' }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
