'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { PlanetIllustration, type PlanetVariant } from '@/components/ui/planet-illustration';
import { Popover } from '@/components/ui/popover';
import type { ChatRoom } from './types';
import styles from './SoulLanding.module.css';

type Props = {
  room: ChatRoom;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

const scenes: PlanetVariant[] = ['planet', 'comet', 'satellite'];

export function ChatRoomCard({ room, onClick, onEdit, onDelete }: Props) {
  const [managementOpen, setManagementOpen] = useState(false);
  const scene = scenes[Array.from(room.code || room.id).reduce((hash, letter) => hash + letter.charCodeAt(0), 0) % scenes.length];

  return (
    <Card padding="md" bodyWrap={false} interactive className={styles.roomCard} data-managed={room.isOwner || undefined}>
      <div className={styles.decoration} data-scene={scene} aria-hidden="true">
        <PlanetIllustration variant={scene} className={styles.backgroundPlanet} />
      </div>
      <Button data-ui-surface variant="ghost" type="button" onClick={onClick}
        className="absolute inset-0 z-0" aria-label={`进入星球：${room.name}`} />

      {room.isOwner && <div className={styles.management}>
        <Popover trigger="click" placement="bottomRight" open={managementOpen} onOpenChange={setManagementOpen}
          content={<div className={styles.menu} aria-label="星球管理">
            <Button variant="ghost" icon={<Icon name="edit" />} onClick={() => { setManagementOpen(false); onEdit?.(); }}>编辑星球</Button>
            <Button variant="ghost" icon={<Icon name="trash" />} onClick={() => { setManagementOpen(false); onDelete?.(); }}>删除星球</Button>
          </div>}>
          <Button size="sm" variant="outline" icon={<Icon name="more" />} aria-label={`管理星球：${room.name}`}
            aria-haspopup="dialog" aria-expanded={managementOpen} />
        </Popover>
      </div>}

      <div className={styles.cardContent}>
        <div className={styles.heading}><h3 className={styles.title}>{room.name}</h3></div>
        <p className={styles.description}>{room.description || '留一个位置，聊聊生活里的小事。'}</p>
        <div className={styles.footer}>
          <span className={styles.roomCode}>
            <Icon name={room.isPrivate ? 'lock' : 'globe'} />
            {room.hasPassword && <Icon name="lock" label="需要密码" />}
            <span>{room.isPrivate ? '私密' : '公共'}</span>
          </span>
          <span className={styles.enter}><Icon name="arrow-right" className={styles.enterArrow} /></span>
        </div>
      </div>
    </Card>
  );
}
