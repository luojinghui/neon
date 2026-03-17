/**
 * 云传状态管理
 * 使用 Zustand 管理所有 UI 响应式状态
 *
 * Created at     : 2025-12-07 22:37:37
 * Last modified  : 2026-03-17 16:38:15
 */

import { create } from 'zustand';
import type { CloudFileInfo } from '@/action';

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  relativePath?: string;
}

interface CloudStore {
  // ===== 核心状态 =====
  text: string;
  password: string;
  queryPassword: string;

  // ===== 文件状态 =====
  files: FileItem[];
  isDragging: boolean;

  // ===== Modal 状态 =====
  isQRModalOpen: boolean;
  isHistoryModalOpen: boolean;
  isJsonModalOpen: boolean;
  showContentInfo: boolean;

  // ===== 历史记录 =====
  textHistory: Array<{ text: string; timestamp: number }>;

  // ===== JSON 相关 =====
  jsonObject: any;

  // ===== 查询结果文件 =====
  queryFiles: CloudFileInfo[];

  // ===== 分享相关 =====
  shareLink: string;

  // ===== Actions =====
  setText: (text: string) => void;
  setPassword: (password: string) => void;
  setQueryPassword: (password: string) => void;
  setFiles: (files: FileItem[]) => void;
  addFiles: (files: FileItem[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  setIsDragging: (dragging: boolean) => void;
  setIsQRModalOpen: (open: boolean) => void;
  setIsHistoryModalOpen: (open: boolean) => void;
  setIsJsonModalOpen: (open: boolean) => void;
  setShowContentInfo: (show: boolean) => void;
  setTextHistory: (history: Array<{ text: string; timestamp: number }>) => void;
  setJsonObject: (obj: any) => void;
  setQueryFiles: (files: CloudFileInfo[]) => void;
  setShareLink: (link: string) => void;
  reset: () => void;
}

export const useCloudStore = create<CloudStore>((set, get) => ({
  // ===== 初始状态 =====
  text: '',
  password: '',
  queryPassword: '',
  files: [],
  isDragging: false,
  isQRModalOpen: false,
  isHistoryModalOpen: false,
  isJsonModalOpen: false,
  showContentInfo: true,
  textHistory: [],
  jsonObject: null,
  queryFiles: [],
  shareLink: '',

  // ===== Actions =====
  setText: (text) => set({ text }),
  setPassword: (password) => set({ password }),
  setQueryPassword: (password) => set({ queryPassword: password }),
  setFiles: (files) => set({ files }),
  addFiles: (newFiles) => set({ files: [...get().files, ...newFiles] }),
  removeFile: (id) => set({ files: get().files.filter((f) => f.id !== id) }),
  clearFiles: () => set({ files: [] }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),
  setIsQRModalOpen: (open) => set({ isQRModalOpen: open }),
  setIsHistoryModalOpen: (open) => set({ isHistoryModalOpen: open }),
  setIsJsonModalOpen: (open) => set({ isJsonModalOpen: open }),
  setShowContentInfo: (show) => set({ showContentInfo: show }),
  setTextHistory: (history) => set({ textHistory: history }),
  setJsonObject: (obj) => set({ jsonObject: obj }),
  setQueryFiles: (queryFiles) => set({ queryFiles }),
  setShareLink: (link) => set({ shareLink: link }),
  reset: () =>
    set({
      text: '',
      password: '',
      queryPassword: '',
      files: [],
      queryFiles: [],
      showContentInfo: false
    })
}));
