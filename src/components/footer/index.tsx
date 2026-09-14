import React from 'react';

export function Footer() {
  return (
    <div className="app-footer center fixed flex flex-col items-center pb-2 text-xs text-foreground-muted">
      <span className="select-none">© {new Date().getFullYear()} Soul Planet - By YiHang</span>
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" className="hover:text-foreground-secondary transition-colors" target="_blank">
        陕ICP备19012299号-1
      </a>
    </div>
  );
}
