'use client';

import Link from 'next/link';
import { ArrowRightOutlined } from '@ant-design/icons';
import { FC, type ReactNode } from 'react';

interface CardProps {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  iconClassName?: string;
}

export const Card: FC<CardProps> = ({ title, description, href, icon, iconClassName = 'bg-primary-soft text-primary' }) => {
  return (
    <Link href={href} className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-hover hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-xl ${iconClassName}`} aria-hidden="true">{icon}</span>
        <ArrowRightOutlined className="text-sm text-foreground-muted transition-colors group-hover:text-primary" aria-hidden="true" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-foreground sm:text-xl">{title}</h2>
      <p className="text-sm leading-6 text-foreground-secondary">{description}</p>
    </Link>
  );
};
