import React from 'react';

export function Footer() {
  return (
    <div className="center flex items-center flex-col text-xs text-foreground-muted fixed bottom-0 w-full pb-2">
      <span className="select-none">© {new Date().getFullYear()} Soul Planet - By JingHui</span>
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" className="hover:text-foreground-secondary transition-colors" target="_blank">
        陕ICP备19012299号-1
      </a>
    </div>
  );
}
