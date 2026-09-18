import React from 'react';

export function Footer() {
  return (
    <footer className="flex shrink-0 flex-col items-center gap-1 px-4 pb-6 pt-4 text-xs text-foreground-muted">
      <span className="select-none">© {new Date().getFullYear()} Soul Planet - JingHui</span>
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" className="hover:text-foreground-secondary transition-colors" target="_blank">
        陕ICP备19012299号-1
      </a>
    </footer>
  );
}
