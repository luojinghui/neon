import { splitTextLinks } from '@/lib/textLinks';

export function LinkifiedText({ content }: { content: string }) {
  return (
    <>
      {splitTextLinks(content).map((segment, index) => segment.href ? (
        <a
          key={index}
          href={segment.href}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer rounded-sm break-all text-sky-700 no-underline transition-colors hover:text-sky-800 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:text-sky-300 dark:hover:text-sky-200"
        >
          {segment.text}
        </a>
      ) : segment.text)}
    </>
  );
}
