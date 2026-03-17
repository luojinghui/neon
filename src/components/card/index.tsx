'use client';

import Link from 'next/link';
import { FC } from 'react';

interface CardProps {
  title: string;
  description: string;
  href: string;
}

export const Card: FC<CardProps> = ({ title, description, href }) => {
  return (
    <Link href={href}>
      <div
        className="group relative rounded-xl border border-border p-6
                    shadow-sm transition-all duration-300
                    hover:shadow-md hover:-translate-y-1
                    bg-surface backdrop-blur-sm
                    hover:border-primary/50"
      >
        <h3 className="mb-2 text-xl font-semibold text-primary">{title}</h3>
        <p className="text-foreground-secondary">{description}</p>
      </div>
    </Link>
  );
};
