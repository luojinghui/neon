import { create } from 'zustand';
import type { ChatMessage, ChatRoom, ConnectionState, MomentShareResult, RoomAccessState } from './core/types';

type RoomsState = 'idle' | 'loading' | 'ready' | 'error';

interface SoulStore {
  rooms: ChatRoom[];
  roomsState: RoomsState;
  roomsError: string;
  roomId: string;
  room: ChatRoom | null;
  roomName: string;
  accessState: RoomAccessState;
  accessError: string;
  messages: ChatMessage[];
  inputText: string;
  connectionState: ConnectionState;
  hasNewMessage: boolean;
  historyBefore: number | null;
  hasMoreHistory: boolean;
  isLoadingHistory: boolean;
  isSending: boolean;
  isUploading: boolean;
  chatError: string;
  roomPoke: { roomId: string; fromName: string; nonce: number } | null;
  pokeNotice: string;
  shareSelecting: boolean;
  shareSelectedIds: string[];
  momentShare: MomentShareResult | null;

  setRooms: (rooms: ChatRoom[]) => void;
  setRoomsState: (state: RoomsState, error?: string) => void;
  setRoom: (room: ChatRoom | null) => void;
  membersVersion: number;
  bumpMembersVersion: () => void;
  jumpToMessageId: string;
  setJumpToMessageId: (id: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  mergeMessages: (messages: ChatMessage[]) => void;
  removeMessage: (messageId: string) => void;
  setAccessState: (state: RoomAccessState, error?: string) => void;
  setInputText: (text: string) => void;
  setConnectionState: (state: ConnectionState) => void;
  setHasNewMessage: (has: boolean) => void;
  setHistoryState: (before: number | null, hasMore: boolean) => void;
  setIsLoadingHistory: (loading: boolean) => void;
  setIsSending: (sending: boolean) => void;
  setIsUploading: (uploading: boolean) => void;
  setChatError: (error: string) => void;
  flashRoom: (roomId: string, fromName: string) => void;
  clearRoomPoke: () => void;
  setPokeNotice: (notice: string) => void;
  startShareSelection: (messageId: string) => void;
  toggleShareSelection: (messageId: string) => void;
  clearShareSelection: () => void;
  setMomentShare: (share: MomentShareResult | null) => void;
  prepareRoom: (roomId: string) => void;
  reset: () => void;
}

function mergeById(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = messages.get(message.id);
    if ((existing?.gameRevision ?? 0) > (message.gameRevision ?? 0)) continue;
    if ((existing?.pollRevision ?? 0) > (message.pollRevision ?? 0)) continue;
    messages.set(message.id, message);
  }
  return [...messages.values()].sort((a, b) => a.timestamp - b.timestamp);
}

const initialState = {
  rooms: [] as ChatRoom[],
  roomsState: 'idle' as RoomsState,
  roomsError: '',
  roomId: '',
  room: null as ChatRoom | null,
  roomName: '',
  membersVersion: 0,
  jumpToMessageId: '',
  accessState: 'joining' as RoomAccessState,
  accessError: '',
  messages: [] as ChatMessage[],
  inputText: '',
  connectionState: 'disconnected' as ConnectionState,
  hasNewMessage: false,
  historyBefore: null as number | null,
  hasMoreHistory: false,
  isLoadingHistory: false,
  isSending: false,
  isUploading: false,
  chatError: '',
  roomPoke: null as SoulStore['roomPoke'],
  pokeNotice: '',
  shareSelecting: false,
  shareSelectedIds: [] as string[],
  momentShare: null as MomentShareResult | null
};

export const useSoulStore = create<SoulStore>((set) => ({
  ...initialState,
  setRooms: (rooms) => set({ rooms, roomsState: 'ready', roomsError: '' }),
  setRoomsState: (roomsState, roomsError = '') => set({ roomsState, roomsError }),
  bumpMembersVersion: () => set((state) => ({ membersVersion: state.membersVersion + 1 })),
  setJumpToMessageId: (jumpToMessageId) => set({ jumpToMessageId }),
  setRoom: (room) => set({ room, roomId: room?.id || '', roomName: room?.name || '' }),
  setMessages: (messages) => set({ messages: mergeById([], messages) }),
  mergeMessages: (messages) => set((state) => ({ messages: mergeById(state.messages, messages) })),
  removeMessage: (messageId) => set((state) => ({ messages: state.messages.filter((message) => message.id !== messageId) })),
  setAccessState: (accessState, accessError = '') => set({ accessState, accessError }),
  setInputText: (inputText) => set({ inputText }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setHasNewMessage: (hasNewMessage) => set({ hasNewMessage }),
  setHistoryState: (historyBefore, hasMoreHistory) => set({ historyBefore, hasMoreHistory }),
  setIsLoadingHistory: (isLoadingHistory) => set({ isLoadingHistory }),
  setIsSending: (isSending) => set({ isSending }),
  setIsUploading: (isUploading) => set({ isUploading }),
  setChatError: (chatError) => set({ chatError }),
  flashRoom: (roomId, fromName) => set((state) => ({ roomPoke: { roomId, fromName, nonce: (state.roomPoke?.nonce || 0) + 1 } })),
  clearRoomPoke: () => set({ roomPoke: null }),
  setPokeNotice: (pokeNotice) => set({ pokeNotice }),
  startShareSelection: (messageId) => set({ shareSelecting: true, shareSelectedIds: [messageId] }),
  toggleShareSelection: (messageId) => set((state) => {
    const selected = state.shareSelectedIds.includes(messageId);
    if (!selected && state.shareSelectedIds.length >= 20) return state;
    return {
      shareSelecting: true,
      shareSelectedIds: selected ? state.shareSelectedIds.filter((id) => id !== messageId) : [...state.shareSelectedIds, messageId]
    };
  }),
  clearShareSelection: () => set({ shareSelecting: false, shareSelectedIds: [] }),
  setMomentShare: (momentShare) => set({ momentShare }),
  prepareRoom: (roomId) =>
    set({
      roomId,
      room: null,
      roomName: '',
      accessState: 'joining',
      accessError: '',
      messages: [],
      inputText: '',
      hasNewMessage: false,
      historyBefore: null,
      hasMoreHistory: false,
      isLoadingHistory: false,
      isSending: false,
      isUploading: false,
      chatError: '',
      pokeNotice: '',
      shareSelecting: false,
      shareSelectedIds: [],
      momentShare: null
    }),
  reset: () => set((state) => ({ ...initialState, rooms: state.rooms, roomsState: state.roomsState === 'ready' ? 'ready' : 'idle' }))
}));
