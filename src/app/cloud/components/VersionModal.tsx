/**
 * 版本更新提示弹窗
 *
 * Created at     : 2026-03-17 19:10:00
 * Last modified  : 2026-04-17 21:58:45
 */

import { Modal, Button } from 'antd';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';
import { VERSION_UPDATES } from '../version';

export default function VersionModal() {
  const isVersionModalOpen = useCloudStore((state) => state.isVersionModalOpen);

  const handleAcknowledge = () => neonCloud.dismissVersionModal();
  const handleRemindLater = () => neonCloud.dismissVersionModal();
  const handleCloseIcon = () => neonCloud.dismissVersionModal();

  return (
    <Modal
      title={
        <div className="flex items-center space-x-2">
          <span className="text-xl">🎉</span>
          <span className="text-foreground">云传更新</span>
        </div>
      }
      open={isVersionModalOpen}
      onCancel={handleCloseIcon}
      keyboard={false}
      footer={null}
      centered
      width={480}
      mask={{ closable: false }}
      className="dark:dark"
    >
      <div className="space-y-4">
        <div className="text-sm text-foreground-secondary">
          <p>本次更新带来以下改进：</p>
        </div>

        <div className="space-y-3">
          {VERSION_UPDATES.map((update, index) => (
            <div key={index} className="flex items-start space-x-3 p-3 bg-background-secondary rounded-lg hover:bg-background-tertiary transition-colors border border-border">
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
