import clsx from 'clsx';
import React from 'react';
import { twMerge } from 'tailwind-merge';

export function Box(props: any) {
  const { className, children, ...other } = props;
  let containerClass = 'w-[980px] mx-auto';
  let baseClass = '';

  const cls = clsx(baseClass, containerClass, className);

  return (
    <div className={twMerge(cls)} {...other}>
      {children}
    </div>
  );
}
