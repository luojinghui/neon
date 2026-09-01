import { create } from 'zustand';
import type { ChatMessage, ChatRoom, ConnectionState } from './core/types';

type RoomsState = 'idle' | 'loading' | 'ready' | 'error';

interface SoulStore {
  rooms: ChatRoom[];
  roomsState: RoomsState;
  roomsError: string;
  roomId: string;
  room: ChatRoom | null;
  roomName: string;
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

  setRooms: (rooms: ChatRoom[]) => void;
  setRoomsState: (state: RoomsState, error?: string) => void;
  setRoom: (room: ChatRoom | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  mergeMessages: (messages: ChatMessage[]) => void;
  setInputText: (text: string) => void;
  setConnectionState: (state: ConnectionState) => void;
  setHasNewMessage: (has: boolean) => void;
  setHistoryState: (before: number | null, hasMore: boolean) => void;
  setIsLoadingHistory: (loading: boolean) => void;
  setIsSending: (sending: boolean) => void;
  setIsUploading: (uploading: boolean) => void;
  setChatError: (error: string) => void;
  prepareRoom: (roomId: string) => void;
  reset: () => void;
}

function mergeById(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.timestamp - b.timestamp);
}

const initialState = {
  rooms: [] as ChatRoom[],
  roomsState: 'idle' as RoomsState,
  roomsError: '',
  roomId: '',
  room: null as ChatRoom | null,
  roomName: '',
  messages: [] as ChatMessage[],
  inputText: '',
  connectionState: 'disconnected' as ConnectionState,
  hasNewMessage: false,
  historyBefore: null as number | null,
  hasMoreHistory: false,
  isLoadingHistory: false,
  isSending: false,
  isUploading: false,
  chatError: ''
};

export const useSoulStore = create<SoulStore>((set) => ({
  ...initialState,
  setRooms: (rooms) => set({ rooms, roomsState: 'ready', roomsError: '' }),
  setRoomsState: (roomsState, roomsError = '') => set({ roomsState, roomsError }),
  setRoom: (room) => set({ room, roomId: room?.id || '', roomName: room?.name || '' }),
  setMessages: (messages) => set({ messages: mergeById([], messages) }),
  mergeMessages: (messages) => set((state) => ({ messages: mergeById(state.messages, messages) })),
  setInputText: (inputText) => set({ inputText }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setHasNewMessage: (hasNewMessage) => set({ hasNewMessage }),
  setHistoryState: (historyBefore, hasMoreHistory) => set({ historyBefore, hasMoreHistory }),
  setIsLoadingHistory: (isLoadingHistory) => set({ isLoadingHistory }),
  setIsSending: (isSending) => set({ isSending }),
  setIsUploading: (isUploading) => set({ isUploading }),
  setChatError: (chatError) => set({ chatError }),
  prepareRoom: (roomId) =>
    set({
      roomId,
      room: null,
      roomName: '',
      messages: [],
      inputText: '',
      hasNewMessage: false,
      historyBefore: null,
      hasMoreHistory: false,
      isLoadingHistory: false,
      isSending: false,
      isUploading: false,
      chatError: ''
    }),
  reset: () => set({ ...initialState })
}));
