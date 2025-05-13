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
      <div className="group relative rounded-[8px] border border-gray-200 p-6 shadow-md transition-all hover:shadow-lg hover:-translate-y-1 bg-white/90">
        <h3 className="mb-2 text-xl font-semibold text-gray-900">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </Link>
  );
};
