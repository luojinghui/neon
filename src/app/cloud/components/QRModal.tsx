/**
 * 二维码分享弹窗组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2025-12-07 23:30:00
 */

import { Modal, QRCode } from 'antd';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';

export default function QRModal() {
  // 直接从 store 获取状态
  const { isQRModalOpen, shareLink } = useCloudStore((state) => ({
    isQRModalOpen: state.isQRModalOpen,
    shareLink: state.shareLink
  }));

  return (
    <Modal title="分享二维码" open={isQRModalOpen} onCancel={() => neonCloud.closeQRModal()} footer={null} centered>
      <div className="flex flex-col items-center space-y-4 py-4">
        <QRCode value={shareLink} size={200} />
        <p className="text-gray-500 text-sm">扫描二维码访问内容</p>
      </div>
    </Modal>
  );
}
