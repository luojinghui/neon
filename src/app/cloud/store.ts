/**
 * 云传状态管理
 * 使用 Zustand 管理所有 UI 响应式状态
 *
 * Created at     : 2025-12-07 22:37:37
 * Last modified  : 2025-12-07 23:33:35
 */

import { create } from 'zustand';

interface CloudStore {
  // ===== 核心状态 =====
  text: string; // 文本内容（核心）
  password: string; // 发送后的密码
  queryPassword: string; // 查询密码

  // ===== Modal 状态 =====
  isQRModalOpen: boolean;
  isHistoryModalOpen: boolean;
  isJsonModalOpen: boolean;
  showContentInfo: boolean;

  // ===== 历史记录 =====
  textHistory: Array<{ text: string; timestamp: number }>;

  // ===== JSON 相关 =====
  jsonObject: any;

  // ===== 分享相关 =====
  shareLink: string;

  // ===== Actions =====
  setText: (text: string) => void;
  setPassword: (password: string) => void;
  setQueryPassword: (password: string) => void;
  setIsQRModalOpen: (open: boolean) => void;
  setIsHistoryModalOpen: (open: boolean) => void;
  setIsJsonModalOpen: (open: boolean) => void;
  setShowContentInfo: (show: boolean) => void;
  setTextHistory: (history: Array<{ text: string; timestamp: number }>) => void;
  setJsonObject: (obj: any) => void;
  setShareLink: (link: string) => void;
  reset: () => void; // 重置所有状态
}

export const useCloudStore = create<CloudStore>((set) => ({
  // ===== 初始状态 =====
  text: '',
  password: '',
  queryPassword: '',
  isQRModalOpen: false,
  isHistoryModalOpen: false,
  isJsonModalOpen: false,
  showContentInfo: true,
  textHistory: [],
  jsonObject: null,
  shareLink: '',

  // ===== Actions =====
  setText: (text) => set({ text }),
  setPassword: (password) => set({ password }),
  setQueryPassword: (password) => set({ queryPassword: password }),
  setIsQRModalOpen: (open) => set({ isQRModalOpen: open }),
  setIsHistoryModalOpen: (open) => set({ isHistoryModalOpen: open }),
  setIsJsonModalOpen: (open) => set({ isJsonModalOpen: open }),
  setShowContentInfo: (show) => set({ showContentInfo: show }),
  setTextHistory: (history) => set({ textHistory: history }),
  setJsonObject: (obj) => set({ jsonObject: obj }),
  setShareLink: (link) => set({ shareLink: link }),
  reset: () =>
    set({
      text: '',
      password: '',
      queryPassword: '',
      showContentInfo: false
    })
}));
