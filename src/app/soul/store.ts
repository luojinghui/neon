import { create } from 'zustand';
import type { ChatMessage } from './[roomId]/components/types';

interface SoulStore {
  roomId: string;
  roomName: string;
  messages: ChatMessage[];
  inputText: string;
  isConnected: boolean;
  hasNewMessage: boolean;

  setRoomId: (id: string) => void;
  setRoomName: (name: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setInputText: (text: string) => void;
  setIsConnected: (connected: boolean) => void;
  setHasNewMessage: (has: boolean) => void;
  reset: () => void;
}

export const useSoulStore = create<SoulStore>((set, get) => ({
  roomId: '',
  roomName: '',
  messages: [],
  inputText: '',
  isConnected: false,
  hasNewMessage: false,

  setRoomId: (id) => set({ roomId: id }),
  setRoomName: (name) => set({ roomName: name }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set({ messages: [...get().messages, message] }),
  setInputText: (text) => set({ inputText: text }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setHasNewMessage: (has) => set({ hasNewMessage: has }),
  reset: () =>
    set({
      roomId: '',
      roomName: '',
      messages: [],
      inputText: '',
      isConnected: false,
      hasNewMessage: false
    })
}));
