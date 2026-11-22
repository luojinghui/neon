import React from 'react';

export function Footer() {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 pb-2.5 pt-1 text-caption text-foreground-muted/55">
      <span className="select-none">© {new Date().getFullYear()} Soul Planet - JingHui</span>
      <span aria-hidden="true" className="select-none opacity-60">·</span>
      <a
        href="https://beian.miit.gov.cn/"
        rel="noopener noreferrer"
        className="rounded-sm transition-colors hover:text-foreground-muted focus-visible:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        target="_blank"
      >
        陕ICP备19012299号-1
      </a>
    </footer>
  );
}
