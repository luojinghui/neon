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
      <div className="group relative rounded-xl border border-[rgb(var(--card-border))] p-6 
                    shadow-sm transition-all duration-300 
                    hover:shadow-md hover:-translate-y-1 
                    bg-[rgb(var(--card-bg))/95] backdrop-blur-sm 
                    dark:bg-[rgb(var(--card-bg))/90] dark:text-white
                    hover:border-[rgb(var(--primary-color))/50]">
        <h3 className="mb-2 text-xl font-semibold text-[rgb(var(--primary-color))]">{title}</h3>
        <p className="text-[rgb(var(--foreground))/80]">{description}</p>
      </div>
    </Link>
  );
};
