import type { ReactNode } from 'react';

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`，。！？；：、（）【】《》“”‘’]+/gi;
const CLOSING_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function trimUrlEnd(value: string): string {
  let url = value;

  while (url) {
    const trimmed = url.replace(/[.,!?;:]+$/, '');
    if (trimmed !== url) {
      url = trimmed;
      continue;
    }

    const closing = url[url.length - 1];
    const opening = CLOSING_BRACKETS[closing];
    if (opening && url.split(closing).length > url.split(opening).length) {
      url = url.slice(0, -1);
      continue;
    }

    break;
  }

  return url;
}

export function MessageText({ content }: { content: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of content.matchAll(URL_PATTERN)) {
    const start = match.index!;
    const label = trimUrlEnd(match[0]);
    const href = /^www\./i.test(label) ? `https://${label}` : label;

    try {
      const url = new URL(href);
      if (!url.hostname || !['http:', 'https:'].includes(url.protocol)) continue;
    } catch {
      continue;
    }

    parts.push(content.slice(cursor, start));
    parts.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="cursor-pointer rounded-sm break-all text-sky-700 no-underline transition-colors hover:text-sky-800 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:text-sky-300 dark:hover:text-sky-200"
      >
        {label}
      </a>
    );
    cursor = start + label.length;
  }

  parts.push(content.slice(cursor));
  return <>{parts}</>;
}
