'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Menu } from '@/components/ui/menu';
import { AppearancePanel } from '@/components/theme/appearance-panel';
import { createProfileHref } from '@/app/profile/navigation';
import { getProfileAvatar } from '@/app/profile/types';
import { useCurrentProfile } from '@/app/profile/useCurrentProfile';
import styles from './MoreMenu.module.css';

type Props = { onClose: () => void; onCreate: () => void; onSearch: () => void };

/** Planet list overflow menu: identity card, quick actions, then appearance. */
export function MoreMenu({ onClose, onCreate, onSearch }: Props) {
  const profile = useCurrentProfile();
  return <Menu className={styles.root}>
    <Link href={createProfileHref('', { returnTo: '/soul' })} className={styles.profile} onClick={onClose}>
      {profile ? <Image src={getProfileAvatar(profile)} alt="" width={40} height={40} unoptimized className={styles.avatar} />
        : <span className={styles.avatarFallback}><Icon name="user" /></span>}
      <span className={styles.who}><strong>{profile?.name || '访客'}</strong><small>个人中心</small></span>
      <Icon name="arrow-right" className={styles.go} />
    </Link>
    <Menu.Section title="快捷操作" className={styles.actions}>
      <Menu.Item icon={<Icon name="plus" />} label="创建星球" className={styles.action} onClick={onCreate} />
      <Menu.Item icon={<Icon name="search" />} label="搜索星球" className={styles.action} onClick={onSearch} />
    </Menu.Section>
    <Menu.Section><div className={styles.appearance}><AppearancePanel /></div></Menu.Section>
  </Menu>;
}
