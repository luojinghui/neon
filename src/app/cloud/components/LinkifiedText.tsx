import { useMemo } from 'react';
import { splitTextLinks } from './textLinks';
import styles from './LinkifiedText.module.css';

export default function LinkifiedText({ text }: { text: string }) {
  const segments = useMemo(() => splitTextLinks(text), [text]);

  return (
    <>
      {segments.map((segment, index) => segment.href ? (
        <a
          key={index}
          href={segment.href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          {segment.text}
        </a>
      ) : segment.text)}
    </>
  );
}
