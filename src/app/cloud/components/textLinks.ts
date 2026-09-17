export interface TextLinkSegment {
  text: string;
  href?: string;
}

// Match explicit web addresses only; leave HTML, file paths, and other schemes as text.
const WEB_URL = /(?:https?:\/\/|www\.)[^\s<>"`\\\u0000-\u001f\u007f\u200b-\u200d\ufeff，。！？；：、（）【】《》「」『』“”‘’]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:']/;
const OPENING_BRACKET: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const CLOSING_BRACKET: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

function trimTrailingPunctuation(candidate: string): string {
  let end = candidate.length;
  const balances: Record<string, number> = { ')': 0, ']': 0, '}': 0 };
  for (const character of candidate) {
    const closing = CLOSING_BRACKET[character];
    if (closing) balances[closing] += 1;
    else if (OPENING_BRACKET[character]) balances[character] -= 1;
  }

  while (end > 0) {
    const last = candidate[end - 1];
    if (TRAILING_PUNCTUATION.test(last)) {
      end -= 1;
      continue;
    }

    if (OPENING_BRACKET[last] && balances[last] < 0) {
      balances[last] += 1;
      end -= 1;
      continue;
    }
    break;
  }

  return candidate.slice(0, end);
}

/** Split display text without changing it or interpreting it as markup. */
export function splitTextLinks(text: string): TextLinkSegment[] {
  const segments: TextLinkSegment[] = [];
  let offset = 0;

  // A fresh RegExp keeps calls independent of the global match cursor.
  for (const match of text.matchAll(new RegExp(WEB_URL))) {
    const start = match.index;
    // Do not link an address that is part of an email, identifier, or another hostname.
    if (start > 0 && /[a-z\d_@.]/i.test(text[start - 1])) continue;

    const label = trimTrailingPunctuation(match[0]);
    let url: URL;
    try {
      url = new URL(/^www\./i.test(label) ? `https://${label}` : label);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) continue;

    if (offset < start) segments.push({ text: text.slice(offset, start) });
    segments.push({ text: label, href: url.href });
    offset = start + label.length;
  }

  if (offset < text.length || segments.length === 0) segments.push({ text: text.slice(offset) });
  return segments;
}
