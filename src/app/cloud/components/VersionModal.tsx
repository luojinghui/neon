/**
 * 版本更新提示弹窗
 *
 * Created at     : 2026-03-17 19:10:00
 * Last modified  : 2026-03-17 19:10:00
 */

import { Modal, Button } from 'antd';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';
import { CLOUD_VERSION, VERSION_UPDATES } from '../version';

const VERSION_KEY = 'neon_cloud_version_acknowledged';

export default function VersionModal() {
  const { isVersionModalOpen, setIsVersionModalOpen } = useCloudStore((state) => ({
    isVersionModalOpen: state.isVersionModalOpen,
    setIsVersionModalOpen: state.setIsVersionModalOpen
  }));

  const handleAcknowledge = () => {
    // 标记为已读，后续不再显示
    localStorage.setItem(VERSION_KEY, CLOUD_VERSION);
    setIsVersionModalOpen(false);
  };

  const handleRemindLater = () => {
    // 关闭弹窗，下次刷新页面时重新显示
    setIsVersionModalOpen(false);
  };

  return (
    <Modal
      title={
        <div className="flex items-center space-x-2">
          <span className="text-xl">🎉</span>
          <span className="text-foreground">云传更新</span>
        </div>
      }
      open={isVersionModalOpen}
      onCancel={handleRemindLater}
      footer={null}
      centered
      width={480}
      className="dark:dark"
    >
      <div className="space-y-4">
        <div className="text-sm text-foreground-secondary">
          <p>本次更新带来以下改进：</p>
        </div>

        <div className="space-y-3">
          {VERSION_UPDATES.map((update, index) => (
            <div
              key={index}
              className="flex items-start space-x-3 p-3 bg-background-secondary rounded-lg hover:bg-background-tertiary transition-colors border border-border"
            >
              <span className="text-2xl flex-shrink-0">{update.icon}</span>
              <div>
                <div className="font-medium text-foreground">{update.title}</div>
                <div className="text-sm text-foreground-secondary">{update.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-border">
          <Button onClick={handleRemindLater} size="large" className="bg-surface hover:bg-surface-hover text-foreground border-border">
            稍后提醒
          </Button>
          <Button type="primary" onClick={handleAcknowledge} size="large">
            知道了
          </Button>
        </div>
      </div>
    </Modal>
  );
}
