'use client';

import { Drawer } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import type { Moment } from '../types';
import { MomentComments } from './MomentComments';
import './moment-comment-sheet.css';

type Props = {
  appearance?: 'journal';
  open: boolean;
  moment: Moment;
  onClose: () => void;
  onCountChange: (count: number) => void;
};

export function MomentCommentSheet({ open, moment, onClose, onCountChange, appearance }: Props) {
  const [hasOpened, setHasOpened] = useState(open);

  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  // Avoid mounting a hidden thread for every card, then preserve its draft and
  // in-flight requests across subsequent closes so counts can still update.
  if (!open && !hasOpened) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      size="min(78dvh, 760px)"
      title={<div className="flex items-center justify-between gap-4"><span>评论</span><Button variant="ghost" size="sm" iconOnly aria-label="关闭评论" title="关闭评论" onClick={onClose}><CloseOutlined /></Button></div>}
      rootClassName={`moment-comment-sheet${appearance === 'journal' ? ' moment-journal-comments' : ''}`}
      classNames={{ wrapper: 'moment-comment-sheet-wrapper', section: 'moment-comment-sheet-section', body: 'moment-comment-sheet-body' }}
      closable={false}
      mask={{ closable: true }}
      keyboard
      forceRender
      destroyOnHidden={false}
    >
      <MomentComments
        momentId={moment.id}
        initialComments={moment.comments}
        initialCount={moment.commentCount}
        onCountChange={onCountChange}
        variant="sheet"
        active={open}
      />
    </Drawer>
  );
}
