'use client';

import { FC } from 'react';

interface HistoryItem {
  id: string;
  password: string;
  timestamp: string;
}

interface HistoryProps {
  items: HistoryItem[];
}

export const History: FC<HistoryProps> = ({ items }) => {
  if (!items.length) return null;

  return (
    <div className="mt-8 w-full max-w-[500px] md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
      <div className="rounded-[8px] border border-gray-200 bg-white/90 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">最近查询</h3>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{item.password}</span>
              <span className="text-gray-400">{item.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 