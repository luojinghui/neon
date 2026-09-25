export type BoardItem = { id: string; authorId: string; color: string } & (
  { kind: 'stroke'; width: number; points: [number, number][] } |
  { kind: 'text'; text: string; x: number; y: number }
);
export interface Presentation {
  id: string;
  kind: 'screen' | 'whiteboard' | 'resource';
  ownerId: string;
  file?: { name: string; mime: string; size: number; extension: string };
  ready?: boolean;
  page: number;
  scroll: number;
  epoch: number;
  items: BoardItem[];
}
export type BoardAction = { type: 'put'; item: BoardItem } | { type: 'remove'; id: string } | { type: 'clear'; epoch: number };
export interface ShareSnapshot {
  roomId: string;
  callId: string;
  revision: number;
  presentation?: Presentation | null;
  shareId?: string;
  action?: BoardAction;
}
export function applyBoardAction(presentation: Presentation, action: BoardAction): Presentation {
  if (action.type === 'clear') return { ...presentation, items: [], epoch: action.epoch };
  if (action.type === 'remove') return { ...presentation, items: presentation.items.filter(item => item.id !== action.id) };
  const exists = presentation.items.some(item => item.id === action.item.id);
  return { ...presentation, items: exists ? presentation.items.map(item => item.id === action.item.id ? action.item : item) : [...presentation.items, action.item] };
}
