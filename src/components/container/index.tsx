import clsx from 'clsx';
import React from 'react';
import { twMerge } from 'tailwind-merge';

export function Container(props: any) {
  const { className, children, ...other } = props;
  let containerClass = '';
  let baseClass = '';
  let isExistFull = false;

  Object.keys(other).forEach((key) => {
    if (key === 'full') {
      containerClass += twMerge(containerClass, 'w-full');
      isExistFull = true;
    } else {
      baseClass += ` ${key} `;
    }
  });

  if (!isExistFull) {
    containerClass += twMerge('neon-container mx-auto', containerClass);
  }

  const cls = clsx(baseClass, containerClass, className);

  return (
    <div className={twMerge(cls)} {...other}>
      {children}
    </div>
  );
}
