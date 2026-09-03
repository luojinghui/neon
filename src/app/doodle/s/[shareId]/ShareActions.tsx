'use client';

import { CopyOutlined, DeleteOutlined, DownloadOutlined, ShareAltOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useEffect, useState } from 'react';
import { getOrCreateIdentity } from '@/app/profile/client';
import { deleteDoodleShare } from '../../client';

type ShareActionsProps = {
  id: string;
  title: string;
  imageUrl: string;
  pageUrl: string;
};

function Actions({ id, title, imageUrl, pageUrl }: ShareActionsProps) {
  const { message, modal } = App.useApp();
  const [isOwner, setIsOwner] = useState(false);
  const getAbsolutePageUrl = () => new URL(pageUrl, window.location.origin).toString();

  useEffect(() => {
    const identity = getOrCreateIdentity();
    void fetch(`/api/doodle/shares/${encodeURIComponent(id)}`, {
      headers: { 'x-neon-user-uuid': identity.uuid },
      cache: 'no-store'
    })
      .then((response) => response.json())
      .then((result: { share?: { isOwner?: boolean } }) => setIsOwner(result.share?.isOwner === true))
      .catch(() => undefined);
  }, [id]);

  const copy = async () => {
    await navigator.clipboard.writeText(getAbsolutePageUrl());
    message.success('链接已复制');
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, text: `我的今日角色：${title}`, url: getAbsolutePageUrl() });
      else await copy();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      message.error('分享没有完成，请复制链接重试');
    }
  };

  const download = () => {
    const anchor = document.createElement('a');
    anchor.href = imageUrl;
    anchor.download = `漫游相机-${title}.jpg`;
    anchor.click();
  };

  const destroy = () => {
    modal.confirm({
      title: '销毁这张涂鸦？',
      content: '销毁后当前链接会立即失效，服务器上的图片也会被删除。',
      okText: '立即销毁',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        await deleteDoodleShare(id);
        message.success('分享已销毁');
        window.location.reload();
      }
    });
  };

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Button size="large" icon={<DownloadOutlined />} onClick={download} className="!h-12 !border-2 !border-[#201a17] !font-black">保存图片</Button>
      <Button size="large" icon={<CopyOutlined />} onClick={() => void copy()} className="!h-12 !border-2 !border-[#201a17] !font-black">复制链接</Button>
      <Button type="primary" size="large" icon={<ShareAltOutlined />} onClick={() => void share()} className="!h-12 !border-2 !border-[#201a17] !bg-[#ff5d46] !font-black">分享</Button>
      {isOwner && <Button danger type="text" icon={<DeleteOutlined />} onClick={destroy} className="sm:col-span-3">我是创建者，销毁这条分享</Button>}
    </div>
  );
}

export default function ShareActions(props: ShareActionsProps) {
  return (
    <App>
      <Actions {...props} />
    </App>
  );
}
