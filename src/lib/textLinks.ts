export interface TextLinkSegment {
  text: string;
  href?: string;
}

const STOP = '\\s<>"`\\\\\\u0000-\\u001f\\u007f\\u200b-\\u200d\\ufeff，。！？；：、（）【】《》「」『』“”‘’';
// Scheme/www links, or a bare domain such as `ipx.al` or `ipcheck.ing/path`.
const WEB_URL = new RegExp(
  `(?:https?:\\/\\/|www\\.)[^${STOP}]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,24}(?::\\d{1,5})?(?:[/?#][^${STOP}]*)?`,
  'gi'
);
const TRAILING_PUNCTUATION = /[.,!?;:']/;
const OPENING_BRACKET: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const CLOSING_BRACKET: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

// Bare domains are only linked for real TLDs, so `file.txt` or `v1.2` stay plain text.
const TLDS = new Set((
  'com net org edu gov mil int info biz name pro mobi asia tel travel jobs museum coop aero xyz top site online store shop tech app dev ing ' +
  'cloud club live link life world today space fun vip ltd inc wiki blog news page work email media chat group team zone digital network ' +
  'studio design art agency academy center company city community directory expert fans fit guru help host im land lol love moe ninja one ' +
  'press red run social software support systems tools tube video website wtf yoga ' +
  'ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz ' +
  'de dj dk dm do dz ec ee eg er es et eu fi fj fk fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il in io iq ir is it je jm jo jp ' +
  'ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om ' +
  'pa pe pf pg ph pk pm pn pr ps pt pw qa re ro ru rw sa sb sc sd se sg si sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz ' +
  'va vc ve vg vi vn vu wf ws ye yt za zm zw'
).split(' '));
// TLDs that are far more often file names (`main.rs`, `README.md`): need a scheme, www, or a path to link.
const FILE_LIKE_TLDS = new Set(['sh', 'md', 'py', 'rs', 'pl', 'cc', 'so']);

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

function toUrl(label: string): URL | null {
  const hasScheme = /^https?:\/\//i.test(label);
  try {
    const url = new URL(hasScheme ? label : `https://${label}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    if (hasScheme || /^www\./i.test(label)) return url;

    // Bare domain: require a known TLD, and a path for file-like TLDs.
    const tld = url.hostname.split('.').pop()!.toLowerCase();
    if (!TLDS.has(tld)) return null;
    if (FILE_LIKE_TLDS.has(tld) && !/^[^/?#]+[/?#]./.test(label)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Split display text without changing it or interpreting it as markup. */
export function splitTextLinks(text: string): TextLinkSegment[] {
  const segments: TextLinkSegment[] = [];
  let offset = 0;

  // A fresh RegExp keeps calls independent of the global match cursor.
  for (const match of text.matchAll(new RegExp(WEB_URL))) {
    const start = match.index;
    if (start < offset) continue;
    // Do not link an address that is part of an email, identifier, path, or another hostname.
    if (start > 0 && /[a-z\d_@./\-:#=]/i.test(text[start - 1])) continue;

    const label = trimTrailingPunctuation(match[0]);
    if (/^@|@/.test(text[start + label.length] ?? '')) continue;
    const url = toUrl(label);
    if (!url) continue;

    if (offset < start) segments.push({ text: text.slice(offset, start) });
    segments.push({ text: label, href: url.href });
    offset = start + label.length;
  }

  if (offset < text.length || segments.length === 0) segments.push({ text: text.slice(offset) });
  return segments;
}
