'use client';

import { Drawer } from 'antd';
import { useEffect, useState } from 'react';
import type { Moment } from '../types';
import { MomentComments } from './MomentComments';
import './moment-comment-sheet.css';

type Props = {
  open: boolean;
  moment: Moment;
  onClose: () => void;
  onCountChange: (count: number) => void;
};

export function MomentCommentSheet({ open, moment, onClose, onCountChange }: Props) {
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
      title="评论"
      rootClassName="moment-comment-sheet"
      classNames={{ wrapper: 'moment-comment-sheet-wrapper', section: 'moment-comment-sheet-section', body: 'moment-comment-sheet-body' }}
      closable={{ placement: 'end' }}
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
