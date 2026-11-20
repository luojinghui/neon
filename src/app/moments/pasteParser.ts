export type ParsedPasteSegment =
  | { type: 'text'; text: string }
  | { type: 'image-file'; file: File; alt: string }
  | { type: 'image-url'; url: string; alt: string };

export type ParsedPasteResult = {
  segments: ParsedPasteSegment[];
  /** Clipboard held only standalone image file(s) with no meaningful text. */
  isStandaloneImages: boolean;
  hasImages: boolean;
  hasHtml: boolean;
};

const MAX_HTML_BYTES = 28_000_000;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'TITLE', 'TEMPLATE', 'SVG', 'HEAD']);
const PARAGRAPH_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'HR', 'UL', 'OL']);
const LINE_BLOCK_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'TR', 'DT', 'DD', 'FIGCAPTION', 'LI', 'ADDRESS']);

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
};

function normalizeClipboardFiles(data: DataTransfer): File[] {
  const fromItems = Array.from(data.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  const raw = (fromItems.length ? fromItems : Array.from(data.files || [])).filter(
    (file) => file.type.startsWith('image/') || (!file.type && /\.(png|jpe?g|gif|webp)$/i.test(file.name))
  );
  return raw.map((file, index) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const type = file.type || MIME_BY_EXT[ext] || 'image/png';
    const suffix = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const name = /\.[a-z0-9]+$/i.test(file.name) ? file.name : `粘贴图片-${Date.now()}-${index + 1}.${suffix}`;
    return new File([file], name, { type, lastModified: file.lastModified });
  });
}

function decodeDataImageUrl(source: string, index: number): File | null {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]+)$/i.exec(source.trim());
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const mimeType = match[1].toLowerCase();
    const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
    return new File([bytes], `粘贴图片-${Date.now()}-${index + 1}.${ext}`, { type: mimeType });
  } catch {
    return null;
  }
}

function isHiddenElement(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  if (element.getAttribute('aria-hidden') === 'true' && element.tagName !== 'IMG') return true;
  const style = element.getAttribute('style') || '';
  return /(?:^|;)\s*display\s*:\s*none\b/i.test(style) || /(?:^|;)\s*visibility\s*:\s*hidden\b/i.test(style);
}

function isPreformatted(element: Element): boolean {
  if (element.tagName === 'PRE') return true;
  const style = element.getAttribute('style') || '';
  return /white-space\s*:\s*pre(?:-wrap|-line)?\b/i.test(style);
}

function pickImageSource(img: Element): string {
  const lazyAttrs = ['data-src', 'data-original', 'data-actualsrc', 'data-url'];
  const rawSrc = (img.getAttribute('src') || '').trim();
  const isPlaceholderSrc = !rawSrc || /^data:image\/svg\+xml/i.test(rawSrc) || /^data:image\/gif;base64,R0lGODlhAQAB/i.test(rawSrc);
  if (isPlaceholderSrc) {
    for (const attr of lazyAttrs) {
      const candidate = (img.getAttribute(attr) || '').trim();
      if (candidate) return candidate;
    }
  }
  return rawSrc;
}

function parsePixelAttr(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isTinyOrEmojiImage(img: Element, src: string, alt: string): boolean {
  const width = parsePixelAttr(img.getAttribute('width'));
  const height = parsePixelAttr(img.getAttribute('height'));
  if ((width !== null && width <= 24) || (height !== null && height <= 24)) return true;
  const className = (img.getAttribute('class') || '').toLowerCase();
  if (/(?:^|\s|[-_])(?:emoji|twemoji|emoticon)(?:\s|[-_]|$)/.test(className)) return true;
  if (/twemoji|emoji/i.test(src) && alt && Array.from(alt.trim()).length <= 3) return true;
  return false;
}

function normalizeTextSegment(raw: string, trimLeading: boolean, trimTrailing: boolean): string {
  let text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u200b/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  if (trimLeading) text = text.replace(/^(?:[ \t]*\n)+/, '');
  if (trimTrailing) text = text.replace(/(?:\n[ \t]*)+$/, '');
  return text;
}

/**
 * Parse an HTML string into ordered text and image segments while preserving
 * paragraph, line, list, and preformatted line breaks.
 */
export function parseHtmlToSegments(html: string, clipboardFiles: File[] = []): ParsedPasteSegment[] {
  if (!html || html.length > MAX_HTML_BYTES || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  if (!root) return [];

  const segments: ParsedPasteSegment[] = [];
  let textBuffer = '';
  let fileCursor = 0;
  let dataImageCount = 0;

  const flushText = () => {
    if (!textBuffer) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.type === 'text') previous.text += textBuffer;
    else segments.push({ type: 'text', text: textBuffer });
    textBuffer = '';
  };

  const ensureNewlines = (count: number) => {
    if (!textBuffer && segments.length === 0) return;
    if (!textBuffer) return;
    const trailing = textBuffer.match(/\n*$/)?.[0].length || 0;
    if (trailing < count) textBuffer += '\n'.repeat(count - trailing);
  };

  const walk = (node: Node, pre: boolean) => {
    if (node.nodeType === 3) {
      // TEXT_NODE
      const raw = node.nodeValue || '';
      if (!raw) return;
      if (pre) {
        textBuffer += raw.replace(/\r\n?/g, '\n');
        return;
      }
      // Collapse pretty-printed HTML source whitespace while preserving NBSP.
      const collapsed = raw.replace(/\u00a0/g, ' ').replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');
      if (!collapsed) return;
      // Avoid leading spaces immediately after a newline.
      if (collapsed === ' ' && (!textBuffer || textBuffer.endsWith('\n') || textBuffer.endsWith(' '))) return;
      if (textBuffer.endsWith('\n')) textBuffer += collapsed.replace(/^ +/, '');
      else textBuffer += collapsed;
      return;
    }

    if (node.nodeType !== 1) return; // ELEMENT_NODE
    const el = node as Element;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag) || isHiddenElement(el)) return;

    if (tag === 'BR') {
      textBuffer += '\n';
      return;
    }

    if (tag === 'HR') {
      ensureNewlines(2);
      return;
    }

    if (tag === 'IMG') {
      const alt = (el.getAttribute('alt') || '').trim();
      const src = pickImageSource(el);
      if (isTinyOrEmojiImage(el, src, alt)) {
        if (alt) textBuffer += alt;
        return;
      }
      if (/^data:image\//i.test(src)) {
        const decoded = decodeDataImageUrl(src, dataImageCount++);
        if (decoded) {
          flushText();
          segments.push({ type: 'image-file', file: decoded, alt });
        }
        return;
      }
      if (/^https?:\/\//i.test(src)) {
        flushText();
        segments.push({ type: 'image-url', url: src, alt });
        return;
      }
      if (fileCursor < clipboardFiles.length) {
        flushText();
        segments.push({ type: 'image-file', file: clipboardFiles[fileCursor++], alt });
      }
      return;
    }

    const nextPre = pre || isPreformatted(el);
    const isParagraph = PARAGRAPH_TAGS.has(tag);
    const isLineBlock = LINE_BLOCK_TAGS.has(tag);

    if (isParagraph) ensureNewlines(2);
    else if (isLineBlock) ensureNewlines(1);

    if (tag === 'LI') {
      const parent = el.parentElement;
      const itemText = (el.textContent || '').trim();
      const alreadyPrefixed = /^(?:[-*•·▪▸–—]|\d+[.)、])\s*/.test(itemText);
      if (!alreadyPrefixed && parent) {
        if (parent.tagName === 'OL') {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === 'LI');
          const start = Number.parseInt(parent.getAttribute('start') || '1', 10) || 1;
          const idx = siblings.indexOf(el);
          textBuffer += `${start + Math.max(0, idx)}. `;
        } else {
          textBuffer += '• ';
        }
      }
    }

    if ((tag === 'TD' || tag === 'TH') && el.previousElementSibling) {
      textBuffer += '\t';
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, nextPre);
    }

    if (isParagraph) ensureNewlines(2);
    else if (isLineBlock) ensureNewlines(1);
  };

  walk(root, false);
  flushText();

  // Append any unconsumed clipboard image files at the end if HTML had images we couldn't match.
  if (fileCursor < clipboardFiles.length && segments.some((seg) => seg.type === 'text' && seg.text.trim().length > 0)) {
    while (fileCursor < clipboardFiles.length) {
      segments.push({ type: 'image-file', file: clipboardFiles[fileCursor++], alt: '' });
    }
  }

  // Merge adjacent text segments and clean boundary newlines cleanly.
  const cleaned: ParsedPasteSegment[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments[i];
    if (current.type === 'text') {
      const prev = cleaned[cleaned.length - 1];
      if (prev && prev.type === 'text') {
        prev.text += current.text;
      } else {
        cleaned.push({ type: 'text', text: current.text });
      }
    } else {
      cleaned.push(current);
    }
  }

  return cleaned
    .map((segment, index) => {
      if (segment.type !== 'text') return segment;
      const hasPrevImage = index > 0;
      const hasNextImage = index < cleaned.length - 1;
      const normalized = normalizeTextSegment(segment.text, true, true);
      if (!normalized) return null;
      return {
        type: 'text' as const,
        text: hasPrevImage || hasNextImage ? normalized : normalizeTextSegment(segment.text, false, false).replace(/^\n+|\n+$/g, '')
      };
    })
    .filter((segment): segment is ParsedPasteSegment => segment !== null);
}

function countLineBreaks(text: string): number {
  return (text.match(/\n/g) || []).length;
}

export function parseMomentClipboard(data: DataTransfer): ParsedPasteResult {
  const files = normalizeClipboardFiles(data);
  const plain = (data.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  const html = data.getData('text/html') || '';

  const htmlSegments = html ? parseHtmlToSegments(html, files) : [];
  const htmlHasImages = htmlSegments.some((seg) => seg.type !== 'text');
  const htmlText = htmlSegments.filter((seg): seg is { type: 'text'; text: string } => seg.type === 'text').map((seg) => seg.text).join('\n\n').trim();

  // Standalone image copy (e.g. screenshot or right-click copy image) with no meaningful text.
  if (files.length > 0 && !plain.trim() && !htmlText) {
    return {
      segments: files.map((file) => ({ type: 'image-file', file, alt: '' })),
      isStandaloneImages: true,
      hasImages: true,
      hasHtml: Boolean(html)
    };
  }

  // Rich HTML with inline images: preserve exact DOM order of text & images.
  if (htmlHasImages) {
    return {
      segments: htmlSegments,
      isStandaloneImages: false,
      hasImages: true,
      hasHtml: true
    };
  }

  // Text-only HTML vs plain text: pick whichever preserves more line structure.
  if (html && htmlText) {
    const cleanedPlain = normalizeTextSegment(plain, true, true);
    const usePlain = cleanedPlain && countLineBreaks(cleanedPlain) > countLineBreaks(htmlText);
    const chosenText = usePlain ? cleanedPlain : htmlText;
    const segments: ParsedPasteSegment[] = [{ type: 'text', text: chosenText }];
    for (const file of files) segments.push({ type: 'image-file', file, alt: '' });
    return {
      segments,
      isStandaloneImages: false,
      hasImages: files.length > 0,
      hasHtml: true
    };
  }

  const segments: ParsedPasteSegment[] = [];
  if (plain) segments.push({ type: 'text', text: plain });
  for (const file of files) segments.push({ type: 'image-file', file, alt: '' });
  return {
    segments,
    isStandaloneImages: false,
    hasImages: files.length > 0,
    hasHtml: false
  };
}
