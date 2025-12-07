/**
 * 内容信息卡片组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2025-12-07 23:30:00
 */

import { Card, Button } from 'antd';
import { CopyOutlined, LinkOutlined, QrcodeOutlined, CloseOutlined } from '@ant-design/icons';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';

export default function ContentInfo() {
  // 直接从 store 获取状态
  const password = useCloudStore((state) => state.password);

  return (
    <Card
      title="内容信息"
      extra={<Button type="text" icon={<CloseOutlined />} onClick={() => neonCloud.hideContentInfo()} className="hover:bg-gray-100" />}
      className="w-full"
      styles={{
        body: { padding: '12px' },
        header: { padding: '8px 12px', minHeight: '40px' }
      }}
    >
      <div className="space-y-2">
        <div className="flex items-center bg-gray-100 p-2 rounded-lg">
          <div className="flex-1 flex items-center space-x-2">
            <span className="text-gray-500 w-[50px]">密码：</span>
            <span className="text-lg font-medium text-gray-800">{password}</span>
            <Button type="text" icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyPassword()} className="hover:bg-gray-100">
              复制密码
            </Button>
          </div>
        </div>

        <div className="flex items-center bg-gray-100 p-2 rounded-lg">
          <div className="flex-1 flex items-center space-x-2 flex-wrap">
            <span className="text-gray-500 w-[50px]">链接：</span>
            <span className="text-sm text-gray-600 truncate max-w-[200px]">{neonCloud.generateShareLink()}</span>
            <div className="flex items-center space-x-1">
              <Button type="text" icon={<LinkOutlined />} onClick={() => neonCloud.handleCopyLink()} className="hover:bg-gray-100">
                复制链接
              </Button>
              <Button type="text" icon={<QrcodeOutlined />} onClick={() => neonCloud.showQRCode()} className="hover:bg-gray-100">
                二维码
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
