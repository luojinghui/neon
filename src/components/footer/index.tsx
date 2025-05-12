import React from 'react';
import { Container } from '@/components/container';

export function Footer() {
  return (
    <div className="center flex-col text-xs opacity-50 fixed bottom-0 w-full">
      <span className="select-none">© {new Date().getFullYear()} Soul Planet - By JingHui</span>
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" className="" target="_blank">
        陕ICP备19012299号-1
      </a>
    </div>
  );
}
