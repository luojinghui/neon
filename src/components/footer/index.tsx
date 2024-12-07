import React from 'react';

export function Footer() {
  return (
    <div className="center flex-col text-xs text-slate-50 opacity-50">
      <span className="">© {new Date().getFullYear()} Soul Planet - By JingHui</span>
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" className="" target="_blank">
        陕ICP备19012299号-1
      </a>
    </div>
  );
}
