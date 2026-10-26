import type { BoardItem } from './sharing';

export type BoardPoint = [number, number];
export type BoardCamera = { x: number; y: number; zoom: number };
export type BoardBounds = { x: number; y: number; width: number; height: number };
export const MIN_BOARD_ZOOM = .1;
export const MAX_BOARD_ZOOM = 4;
export const BOARD_COORDINATE_LIMIT = 1000000;

export const clampBoardCoordinate = (value: number): number => Math.round(Math.max(-BOARD_COORDINATE_LIMIT, Math.min(BOARD_COORDINATE_LIMIT, value)) * 1000) / 1000;
export const screenToBoard = (point: BoardPoint, camera: BoardCamera): BoardPoint => [(point[0] - camera.x) / camera.zoom, (point[1] - camera.y) / camera.zoom];
export const boardToScreen = (point: BoardPoint, camera: BoardCamera): BoardPoint => [point[0] * camera.zoom + camera.x, point[1] * camera.zoom + camera.y];

/** Keep the world coordinate under the cursor/finger fixed while zooming. */
export function zoomBoardAt(camera: BoardCamera, zoom: number, anchor: BoardPoint): BoardCamera {
  const next = Math.max(MIN_BOARD_ZOOM, Math.min(MAX_BOARD_ZOOM, zoom));
  const point = screenToBoard(anchor, camera);
  return { x: anchor[0] - point[0] * next, y: anchor[1] - point[1] * next, zoom: next };
}

export function boardTextBox(item: Extract<BoardItem, { kind: 'text' }>) {
  const lines: string[] = [];
  const units = 360 / item.fontSize;
  const widthOf = (line: string) => Array.from(line).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 1 : .6), 0);
  for (const paragraph of (item.text || ' ').split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && widthOf(line + char) > units) { lines.push(line); line = ''; }
      line += char;
    }
    lines.push(line);
  }
  return { lines, width: Math.max(64, ...lines.map(line => widthOf(line) * item.fontSize + 12)), height: Math.max(item.fontSize * 1.4 + 12, lines.length * item.fontSize * 1.4 + 12) };
}

export function boardItemBounds(item: BoardItem): BoardBounds {
  if (item.kind === 'text') {
    const { width, height } = boardTextBox(item);
    return { x: item.x, y: item.y, width, height };
  }
  if (item.kind === 'shape') return { x: Math.min(item.x, item.endX), y: Math.min(item.y, item.endY), width: Math.abs(item.endX - item.x), height: Math.abs(item.endY - item.y) };
  const x = item.points.map(point => point[0]), y = item.points.map(point => point[1]);
  const left = Math.min(...x), top = Math.min(...y);
  return { x: left, y: top, width: Math.max(...x) - left, height: Math.max(...y) - top };
}

export function moveBoardItem(item: BoardItem, dx: number, dy: number): BoardItem {
  const bounds = boardItemBounds(item);
  const x = Math.max(-BOARD_COORDINATE_LIMIT - bounds.x, Math.min(BOARD_COORDINATE_LIMIT - bounds.x - bounds.width, dx));
  const y = Math.max(-BOARD_COORDINATE_LIMIT - bounds.y, Math.min(BOARD_COORDINATE_LIMIT - bounds.y - bounds.height, dy));
  if (item.kind === 'stroke') return { ...item, points: item.points.map(point => [clampBoardCoordinate(point[0] + x), clampBoardCoordinate(point[1] + y)]) };
  if (item.kind === 'shape') return { ...item, x: clampBoardCoordinate(item.x + x), y: clampBoardCoordinate(item.y + y), endX: clampBoardCoordinate(item.endX + x), endY: clampBoardCoordinate(item.endY + y) };
  return { ...item, x: clampBoardCoordinate(item.x + x), y: clampBoardCoordinate(item.y + y) };
}

/** Resize from the original pointer delta so grabbing a padded handle cannot jump. */
export function resizeBoardShape(item: Extract<BoardItem, { kind: 'shape' }>, dx: number, dy: number): Extract<BoardItem, { kind: 'shape' }> {
  if (item.shape === 'line' || item.shape === 'arrow') return { ...item, endX: clampBoardCoordinate(item.endX + dx), endY: clampBoardCoordinate(item.endY + dy) };
  const box = boardItemBounds(item);
  const right = clampBoardCoordinate(Math.max(box.x + 1, box.x + box.width + dx));
  const bottom = clampBoardCoordinate(Math.max(box.y + 1, box.y + box.height + dy));
  // Rectangle/ellipse handles live at the visual bottom-right, independently
  // of the direction in which the original two corners were drawn.
  return {
    ...item,
    x: item.x <= item.endX ? box.x : right,
    endX: item.x <= item.endX ? right : box.x,
    y: item.y <= item.endY ? box.y : bottom,
    endY: item.y <= item.endY ? bottom : box.y
  };
}

function segmentDistance(point: BoardPoint, a: BoardPoint, b: BoardPoint): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const ratio = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point[0] - a[0] - ratio * dx, point[1] - a[1] - ratio * dy);
}

export function hitTestBoardItem(item: BoardItem, point: BoardPoint, tolerance: number): boolean {
  const box = boardItemBounds(item), x = point[0], y = point[1];
  if (x < box.x - tolerance || x > box.x + box.width + tolerance || y < box.y - tolerance || y > box.y + box.height + tolerance) return false;
  if (item.kind === 'text') return true;
  if (item.kind === 'stroke') return item.points.some((p, index) => segmentDistance(point, p, item.points[index + 1] || p) <= tolerance);
  if (item.shape === 'line' || item.shape === 'arrow') return segmentDistance(point, [item.x, item.y], [item.endX, item.endY]) <= tolerance;
  if (item.fill) return true;
  if (item.shape === 'rectangle') return Math.min(Math.abs(x - box.x), Math.abs(x - box.x - box.width), Math.abs(y - box.y), Math.abs(y - box.y - box.height)) <= tolerance;
  const rx = Math.max(.001, box.width / 2), ry = Math.max(.001, box.height / 2);
  return Math.abs(Math.hypot((x - box.x - rx) / rx, (y - box.y - ry) / ry) - 1) <= tolerance / Math.min(rx, ry);
}

export function fitBoardItems(items: BoardItem[], width: number, height: number): BoardCamera {
  if (!items.length) return { x: width / 2, y: height / 2, zoom: 1 };
  const boxes = items.map(boardItemBounds);
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
  const zoom = Math.max(MIN_BOARD_ZOOM, Math.min(2, Math.max(1, width - 80) / Math.max(80, right - x), Math.max(1, height - 80) / Math.max(80, bottom - y)));
  return { x: width / 2 - (x + right) / 2 * zoom, y: height / 2 - (y + bottom) / 2 * zoom, zoom };
}
