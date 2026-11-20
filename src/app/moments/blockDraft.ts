import type { CreateMomentBlockInput, Moment } from './types';
import type { ParsedPasteSegment } from './pasteParser';

export const MAX_MOMENT_TEXT_LENGTH = 10000;
export const MAX_MOMENT_INLINE_IMAGES = 30;

export type DraftTextBlock = {
  id: string;
  type: 'text';
  text: string;
};

export type DraftImageBlock = {
  id: string;
  type: 'image';
  status: 'loading' | 'ready' | 'error';
  existingId?: string;
  file?: File;
  previewUrl?: string;
  sourceUrl?: string;
  alt: string;
  errorMessage?: string;
};

export type DraftBlock = DraftTextBlock | DraftImageBlock;

let blockCounter = 0;

export function createBlockId(prefix = 'blk'): string {
  blockCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${blockCounter.toString(36)}`;
}

export function createEmptyDraftBlocks(): DraftBlock[] {
  return [{ id: createBlockId('txt'), type: 'text', text: '' }];
}

export function createDraftBlocksFromMoment(moment: Moment): DraftBlock[] {
  const raw: DraftBlock[] = [];
  const seenImageIds = new Set<string>();

  if (Array.isArray(moment.blocks) && moment.blocks.length > 0) {
    for (const block of moment.blocks) {
      if (block.type === 'text') {
        raw.push({ id: createBlockId('txt'), type: 'text', text: block.text });
      } else {
        seenImageIds.add(block.id);
        raw.push({
          id: createBlockId('img'),
          type: 'image',
          status: 'ready',
          existingId: block.id,
          previewUrl: block.url,
          alt: block.alt || ''
        });
      }
    }
  } else if (moment.text) {
    raw.push({ id: createBlockId('txt'), type: 'text', text: moment.text });
  }

  for (const item of moment.media || []) {
    if (item.type === 'image' && !seenImageIds.has(item.id)) {
      seenImageIds.add(item.id);
      raw.push({
        id: createBlockId('img'),
        type: 'image',
        status: 'ready',
        existingId: item.id,
        previewUrl: item.url,
        alt: ''
      });
    }
  }

  return normalizeDraftBlocks(raw);
}

/**
 * Keep block invariants:
 * - Merge adjacent text blocks cleanly.
 * - Always maintain a text block before the first image, between consecutive images,
 *   and after the last image so the user can type anywhere.
 */
export function normalizeDraftBlocks(blocks: DraftBlock[]): DraftBlock[] {
  if (blocks.length === 0) return createEmptyDraftBlocks();
  const merged: DraftBlock[] = [];
  for (const block of blocks) {
    const prev = merged[merged.length - 1];
    if (block.type === 'text' && prev && prev.type === 'text') {
      const joined = prev.text && block.text ? `${prev.text}\n\n${block.text}` : prev.text || block.text;
      merged[merged.length - 1] = { ...prev, text: joined };
    } else {
      merged.push(block);
    }
  }

  const normalized: DraftBlock[] = [];
  for (let i = 0; i < merged.length; i += 1) {
    const current = merged[i];
    if (current.type === 'image') {
      const prev = normalized[normalized.length - 1];
      if (!prev || prev.type !== 'text') {
        normalized.push({ id: createBlockId('txt'), type: 'text', text: '' });
      }
      normalized.push(current);
      const next = merged[i + 1];
      if (!next || next.type !== 'text') {
        normalized.push({ id: createBlockId('txt'), type: 'text', text: '' });
      }
    } else {
      normalized.push(current);
    }
  }
  return normalized.length ? normalized : createEmptyDraftBlocks();
}

export function countDraftInlineImages(blocks: DraftBlock[]): number {
  return blocks.filter((block) => block.type === 'image').length;
}

export function deriveDraftText(blocks: DraftBlock[]): string {
  return blocks
    .filter((block): block is DraftTextBlock => block.type === 'text')
    .map((block) => block.text.replace(/\r\n?/g, '\n').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

export function countDraftTextLength(blocks: DraftBlock[]): number {
  return Array.from(deriveDraftText(blocks)).length;
}

export function insertSegmentsIntoBlocks(
  blocks: DraftBlock[],
  targetBlockId: string,
  selectionStart: number,
  selectionEnd: number,
  segments: ParsedPasteSegment[],
  options: { maxInlineImages?: number; createPreviewUrl?: (file: File) => string } = {}
): {
  blocks: DraftBlock[];
  pendingRemoteIds: { id: string; url: string }[];
  overflowImageCount: number;
  focusBlockId: string;
  focusCaret: number;
} {
  const maxInlineImages = options.maxInlineImages ?? MAX_MOMENT_INLINE_IMAGES;
  const createPreviewUrl = options.createPreviewUrl || ((file: File) => URL.createObjectURL(file));
  const currentImages = countDraftInlineImages(blocks);
  let remainingImages = Math.max(0, maxInlineImages - currentImages);
  let overflowImageCount = 0;

  let index = blocks.findIndex((block) => block.id === targetBlockId && block.type === 'text');
  if (index < 0) {
    index = blocks.length - 1;
    while (index >= 0 && blocks[index].type !== 'text') index -= 1;
  }
  if (index < 0) {
    const initial = createEmptyDraftBlocks();
    return insertSegmentsIntoBlocks(initial, initial[0].id, 0, 0, segments, options);
  }

  const target = blocks[index] as DraftTextBlock;
  const safeStart = Math.max(0, Math.min(selectionStart, target.text.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, target.text.length));
  const beforeText = target.text.slice(0, safeStart);
  const afterText = target.text.slice(safeEnd);

  const inserted: DraftBlock[] = [];
  const pendingRemoteIds: { id: string; url: string }[] = [];
  let runningText = beforeText;
  let lastTextId = target.id;
  let lastTextCaret = beforeText.length;

  for (const segment of segments) {
    if (segment.type === 'text') {
      runningText += segment.text;
      lastTextCaret = runningText.length;
    } else if (remainingImages > 0) {
      remainingImages -= 1;
      inserted.push({ id: lastTextId, type: 'text', text: runningText });
      const imageId = createBlockId('img');
      if (segment.type === 'image-file') {
        inserted.push({
          id: imageId,
          type: 'image',
          status: 'ready',
          file: segment.file,
          previewUrl: createPreviewUrl(segment.file),
          alt: segment.alt
        });
      } else {
        inserted.push({
          id: imageId,
          type: 'image',
          status: 'loading',
          sourceUrl: segment.url,
          alt: segment.alt
        });
        pendingRemoteIds.push({ id: imageId, url: segment.url });
      }
      lastTextId = createBlockId('txt');
      runningText = '';
      lastTextCaret = 0;
    } else {
      overflowImageCount += 1;
    }
  }

  const finalText = runningText + afterText;
  inserted.push({ id: lastTextId, type: 'text', text: finalText });

  const next = [...blocks.slice(0, index), ...inserted, ...blocks.slice(index + 1)];
  return {
    blocks: normalizeDraftBlocks(next),
    pendingRemoteIds,
    overflowImageCount,
    focusBlockId: lastTextId,
    focusCaret: lastTextCaret
  };
}

export function removeImageBlock(
  blocks: DraftBlock[],
  imageBlockId: string
): { blocks: DraftBlock[]; removed?: DraftImageBlock; focusBlockId: string; focusCaret: number } {
  const index = blocks.findIndex((block) => block.id === imageBlockId && block.type === 'image');
  if (index < 0) return { blocks, focusBlockId: blocks[0]?.id || '', focusCaret: 0 };

  const removed = blocks[index] as DraftImageBlock;
  const prev = blocks[index - 1];
  const next = blocks[index + 1];

  if (prev?.type === 'text' && next?.type === 'text') {
    const caret = prev.text.length;
    const joined = prev.text && next.text ? `${prev.text}\n\n${next.text}` : prev.text || next.text;
    const merged: DraftTextBlock = { ...prev, text: joined };
    const updated = [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 2)];
    return { blocks: normalizeDraftBlocks(updated), removed, focusBlockId: merged.id, focusCaret: caret };
  }

  const updated = normalizeDraftBlocks([...blocks.slice(0, index), ...blocks.slice(index + 1)]);
  const fallbackText = updated.find((block): block is DraftTextBlock => block.type === 'text');
  return {
    blocks: updated,
    removed,
    focusBlockId: fallbackText?.id || '',
    focusCaret: fallbackText?.text.length || 0
  };
}

export function buildMomentSubmission(blocks: DraftBlock[]): {
  text: string;
  blocks?: CreateMomentBlockInput[];
  inlineImages: File[];
} {
  const text = deriveDraftText(blocks);
  const inlineImages: File[] = [];
  const payloadBlocks: CreateMomentBlockInput[] = [];
  let imageCount = 0;

  for (const block of blocks) {
    if (block.type === 'text') {
      const cleaned = block.text.replace(/\r\n?/g, '\n').trim();
      if (!cleaned) continue;
      const prev = payloadBlocks[payloadBlocks.length - 1];
      if (prev && prev.type === 'text') prev.text = `${prev.text}\n\n${cleaned}`;
      else payloadBlocks.push({ type: 'text', text: cleaned });
    } else if (block.status === 'ready') {
      if (block.file) {
        const inlineIndex = inlineImages.length;
        inlineImages.push(block.file);
        imageCount += 1;
        payloadBlocks.push({ type: 'image', inlineIndex, alt: block.alt || undefined });
      } else if (block.existingId) {
        imageCount += 1;
        payloadBlocks.push({ type: 'image', existingId: block.existingId, alt: block.alt || undefined });
      }
    }
  }

  if (imageCount === 0) {
    return { text, inlineImages: [] };
  }
  return { text, blocks: payloadBlocks, inlineImages };
}
