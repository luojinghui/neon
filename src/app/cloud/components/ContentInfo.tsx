import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
/**
 * 内容分享信息
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2026-03-17 17:04:13
 */


import { CopyOutlined, QrcodeOutlined, CloseOutlined } from '@ant-design/icons';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';

export default function ContentInfo() {
  const password = useCloudStore((state) => state.password);
  const shareLink = neonCloud.generateShareLink();

  return (
    <Card as="section" padding="none" bodyWrap={false} aria-labelledby="cloud-share-heading" className="cloud-panel cloud-share-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="cloud-share-heading" className="text-base font-semibold text-foreground">分享信息</h2>
        <Button variant="ghost" aria-label="关闭内容信息" icon={<CloseOutlined />} onClick={() => neonCloud.hideContentInfo()} />
      </div>
      <dl className="grid gap-5 md:grid-cols-[minmax(180px,0.45fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <dt className="cloud-share-label">提取密码</dt>
          <dd className="cloud-share-row">
            <span className="cloud-share-value">{password}</span>
            <div className="cloud-share-actions">
              <Button variant="ghost" aria-label="复制密码" title="复制密码" icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyPassword()} className="cloud-share-action" />
            </div>
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="cloud-share-label">分享链接</dt>
          <dd className="cloud-share-row">
            <span className="cloud-share-value" title={shareLink}>{shareLink}</span>
            <div className="cloud-share-actions">
              <Button variant="ghost" aria-label="复制链接" title="复制链接" icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyLink()} className="cloud-share-action" />
              <Button variant="ghost" aria-label="二维码" title="二维码" icon={<QrcodeOutlined />} onClick={() => neonCloud.showQRCode()} className="cloud-share-action" />
            </div>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
