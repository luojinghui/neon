import React from 'react';
import { Container } from '@/components/container';

export function Footer() {
  return (
    <Container className="mx-auto center">
      <div className="center flex-col text-xs text-slate-50 opacity-50">
        <span className="">© {new Date().getFullYear()} Neon Planet-霓彩星球 - By JingHui</span>
        <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" className="" target="_blank">
          陕ICP备19012299号-1
        </a>
      </div>
    </Container>
  );
}
