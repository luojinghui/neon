/**
 * 云传管理模块 - 核心业务逻辑层
 * 负责：业务逻辑、数据处理、与 Store 同步
 *
 * Created at     : 2025-12-07 22:37:37
 * Last modified  : 2026-04-25 20:59:21
 */

import { CloudAPI } from '@/action';
import { useCloudStore, FileItem } from './store';
import { HISTORY_KEY, TEXT_HISTORY_KEY, MAX_HISTORY, MAX_TEXT_HISTORY } from '@/constants/cloud';
import { MessageInstance } from 'antd/es/message/interface';
import { CLOUD_VERSION, CLOUD_VERSION_DISMISSED_KEY } from './version';

export class NeonCloud {
  // ===== 私有变量（内部缓存） =====
  private _text: string = '';
  private _password: string = '';
  private _queryPassword: string = '';
  private _message: MessageInstance | null = null;

  // ===== 初始化 =====

  /**
   * 设置消息通知 API（依赖注入）
   */
  public setMessage(message: MessageInstance): void {
    this._message = message;
  }

  /**
   * 初始化
   */
  public async init() {
    // 加载历史记录
    this.loadTextHistory();

    // 检查版本更新提示
    // this.checkVersionModal();

    // 从 URL 解析密码并自动查询
    return await this.handleUrlParams();
  }

  /**
   * 检查是否需要展示版本更新弹窗
   */
  public checkVersionModal(): void {
    const dismissedVersion = localStorage.getItem(CLOUD_VERSION_DISMISSED_KEY);
    if (dismissedVersion === CLOUD_VERSION) return;

    // 延迟显示，避免首屏渲染阶段突兀弹出
    window.setTimeout(() => {
      useCloudStore.getState().setIsVersionModalOpen(true);
    }, 500);
  }

  /**
   * 关闭版本更新弹窗并记录当前版本已处理
   */
  public dismissVersionModal(): void {
    localStorage.setItem(CLOUD_VERSION_DISMISSED_KEY, CLOUD_VERSION);
    useCloudStore.getState().setIsVersionModalOpen(false);
  }

  // ===== Text 管理（核心功能） =====

  /**
   * 获取文本内容
   */
  public getText(): string {
    return this._text;
  }

  /**
   * 设置文本内容（同步到 store）
   */
  public setText(text: string): void {
    this._text = text;
    // 同步更新 store，触发 UI 响应
    useCloudStore.getState().setText(text);
  }

  /**
   * 获取密码
   */
  public getPassword(): string {
    return this._password;
  }

  /**
   * 设置密码（同步到 store）
   */
  public setPassword(password: string): void {
    this._password = password;
    useCloudStore.getState().setPassword(password);
  }

  /**
   * 获取查询密码
   */
  public getQueryPassword(): string {
    return this._queryPassword;
  }

  /**
   * 设置查询密码（同步到 store）
   */
  public setQueryPassword(password: string): void {
    this._queryPassword = password;
    useCloudStore.getState().setQueryPassword(password);
  }

  // ===== 核心业务逻辑 =====

  /**
   * 发送消息（纯文本走 JSON，有文件走 FormData）
   */
  public async sendMessage(): Promise<void> {
    const store = useCloudStore.getState();
    const files = store.files;
    const hasText = !!this._text.trim();
    const hasFiles = files.length > 0;

    if (!hasText && !hasFiles) {
      this._message?.warning('请输入内容或选择文件');
      return;
    }

    store.setIsSending(true);
    store.setUploadProgress(0);

    try {
      let data;

      if (hasFiles) {
        const rawFiles = files.map((f) => f.file);
        const relativePaths = files.map((f) => f.relativePath || f.name);
        data = await CloudAPI.sendWithFiles(this._text, rawFiles, relativePaths, (percent) => {
          useCloudStore.getState().setUploadProgress(percent);
        });
      } else {
        data = await CloudAPI.sendMessage(this._text);
      }

      useCloudStore.getState().setUploadProgress(100);

      if (data.state === 200) {
        this.setPassword(data.data.password);
        if (hasText) this.addToTextHistory(this._text);
        useCloudStore.getState().setShowContentInfo(true);
        useCloudStore.getState().clearFiles();
        useCloudStore.getState().setQueryFiles([]);

        this._message?.success('发送成功，请及时分享密码');
      } else {
        this._message?.error(data.message || '发送失败');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      this._message?.error('发送失败，请重试');
    } finally {
      useCloudStore.getState().setIsSending(false);
      useCloudStore.getState().setUploadProgress(0);
    }
  }

  /**
   * 查询消息
   */
  public async queryMessage(password?: string): Promise<void> {
    const pwd = password || this._queryPassword;

    if (!pwd) {
      this._message?.error('请输入密码');
      return;
    }

    try {
      const data = await CloudAPI.queryMessage(pwd);

      if (data.state === 200) {
        this.setText(data.data.text || '');
        useCloudStore.getState().setQueryFiles(data.data.files || []);
        this.addToQueryHistory(pwd);

        if (data.data.files?.length > 0) {
          this.setPassword(pwd);
          useCloudStore.getState().setShowContentInfo(true);
        }

        this._message?.success('查询成功');
      } else {
        this._message?.error(data.message || '查询失败');
      }
    } catch (error) {
      console.error('查询消息失败:', error);
      this._message?.error('查询失败，请重试');
    }
  }

  // ===== 历史记录管理 =====

  /**
   * 添加到查询历史
   */
  private addToQueryHistory(password: string): void {
    if (!password) return;

    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newHistory = [password, ...history.filter((item: string) => item !== password)].slice(0, MAX_HISTORY);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  }

  /**
   * 添加到文本历史
   */
  private addToTextHistory(text: string): void {
    if (!text) return;

    const history = JSON.parse(localStorage.getItem(TEXT_HISTORY_KEY) || '[]');
    const newItem = { text, timestamp: Date.now() };
    const newHistory = [newItem, ...history].slice(0, MAX_TEXT_HISTORY);

    localStorage.setItem(TEXT_HISTORY_KEY, JSON.stringify(newHistory));
    useCloudStore.getState().setTextHistory(newHistory);
  }

  /**
   * 加载文本历史
   */
  public loadTextHistory(): void {
    const history = JSON.parse(localStorage.getItem(TEXT_HISTORY_KEY) || '[]');
    useCloudStore.getState().setTextHistory(history);
  }

  /**
   * 删除文本历史项
   */
  public deleteTextHistory(timestamp: number): void {
    const history = JSON.parse(localStorage.getItem(TEXT_HISTORY_KEY) || '[]');
    const newHistory = history.filter((item: { text: string; timestamp: number }) => item.timestamp !== timestamp);

    localStorage.setItem(TEXT_HISTORY_KEY, JSON.stringify(newHistory));
    useCloudStore.getState().setTextHistory(newHistory);
  }

  /**
   * 使用历史记录项
   */
  public useHistoryItem(item: { text: string; timestamp: number }): void {
    this.setText(item.text);
    useCloudStore.getState().setIsHistoryModalOpen(false);
  }

  // ===== UI 事件处理方法 =====

  /**
   * 处理文本变化
   */
  public handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    this.setText(e.target.value);
  }

  /**
   * 处理查询密码变化
   */
  public handleQueryPasswordChange(e: React.ChangeEvent<HTMLInputElement>): void {
    this.setQueryPassword(e.target.value);
  }

  /**
   * 处理复制文本
   */
  public handleCopyText(): void {
    if (!this._text) return;
    navigator.clipboard.writeText(this._text);
    this._message?.success('内容已复制');
  }

  /**
   * 处理复制密码
   */
  public handleCopyPassword(): void {
    if (!this._password) return;
    navigator.clipboard.writeText(this._password);
    this._message?.success('密码已复制');
  }

  /**
   * 处理复制链接
   */
  public handleCopyLink(): void {
    const link = this.generateShareLink();
    navigator.clipboard.writeText(link);
    this._message?.success('链接已复制');
  }

  /**
   * 处理复制格式化的 JSON
   */
  public handleCopyFormattedJson(): void {
    const jsonObject = useCloudStore.getState().jsonObject;

    if (!jsonObject) return;

    const formattedJson = JSON.stringify(jsonObject, null, 2);
    navigator.clipboard.writeText(formattedJson);
    this._message?.success('JSON已复制');
  }

  /**
   * 处理复制历史记录文本
   */
  public handleCopyHistoryText(text: string): void {
    navigator.clipboard.writeText(text);
    this._message?.success('内容已复制');
  }

  /**
   * 显示历史记录弹窗
   */
  public showHistoryModal(): void {
    useCloudStore.getState().setIsHistoryModalOpen(true);
  }

  /**
   * 关闭历史记录弹窗
   */
  public closeHistoryModal(): void {
    useCloudStore.getState().setIsHistoryModalOpen(false);
  }

  /**
   * 关闭 JSON 弹窗
   */
  public closeJsonModal(): void {
    useCloudStore.getState().setIsJsonModalOpen(false);
  }

  /**
   * 关闭二维码弹窗
   */
  public closeQRModal(): void {
    useCloudStore.getState().setIsQRModalOpen(false);
  }

  /**
   * 隐藏内容信息卡片
   */
  public hideContentInfo(): void {
    useCloudStore.getState().setShowContentInfo(false);
  }

  // ===== JSON 解析 =====

  /**
   * 解析 JSON
   */
  public parseJson(): void {
    if (!this._text.trim()) {
      this._message?.warning('请先输入内容');
      return;
    }

    try {
      const parsed = JSON.parse(this._text);

      useCloudStore.getState().setJsonObject(parsed);
      useCloudStore.getState().setIsJsonModalOpen(true);
    } catch (error) {
      this._message?.error('JSON格式错误，无法解析');
    }
  }

  // ===== 分享功能 =====

  /**
   * 生成分享链接
   */
  public generateShareLink(): string {
    if (typeof window === 'undefined') return '';

    return `${window.location.origin}/cloud?pwd=${this._password}`;
  }

  /**
   * 显示二维码
   */
  public showQRCode(): void {
    const link = this.generateShareLink();
    useCloudStore.getState().setShareLink(link);
    useCloudStore.getState().setIsQRModalOpen(true);
  }

  // ===== 文件管理 =====

  private createFileItem(file: File, relativePath?: string): FileItem {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      relativePath
    };
  }

  /**
   * 递归遍历 FileSystemEntry 获取所有文件（支持文件夹拖拽）
   */
  private async traverseEntry(entry: FileSystemEntry, basePath = ''): Promise<FileItem[]> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      return new Promise((resolve) => {
        fileEntry.file((file) => {
          const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
          resolve([this.createFileItem(file, relativePath)]);
        });
      });
    }

    if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name;

      return new Promise((resolve) => {
        const allItems: FileItem[] = [];
        const readBatch = () => {
          reader.readEntries(async (entries) => {
            if (entries.length === 0) {
              resolve(allItems);
              return;
            }
            const results = await Promise.all(entries.map((e) => this.traverseEntry(e, dirPath)));
            allItems.push(...results.flat());
            readBatch();
          });
        };
        readBatch();
      });
    }

    return [];
  }

  /**
   * 处理拖拽放下事件
   */
  public async handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    useCloudStore.getState().setIsDragging(false);

    const items = e.dataTransfer.items;

    // dataTransfer.items is cleared after the event handler returns,
    // so we must synchronously snapshot all entries/files first.
    const entries: FileSystemEntry[] = [];
    const plainFiles: File[] = [];

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;

        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          entries.push(entry);
        } else {
          const file = item.getAsFile?.();
          if (file) plainFiles.push(file);
        }
      }
    }

    // Fallback for environments that don't populate items
    if (entries.length === 0 && plainFiles.length === 0 && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        plainFiles.push(e.dataTransfer.files[i]);
      }
    }

    // Now do async traversal on the pre-collected snapshots
    const fileItems: FileItem[] = [];

    for (const entry of entries) {
      const results = await this.traverseEntry(entry);
      fileItems.push(...results);
    }

    for (const file of plainFiles) {
      fileItems.push(this.createFileItem(file, file.name));
    }

    if (fileItems.length === 0) return;

    useCloudStore.getState().addFiles(fileItems);
    this._message?.success(`已添加 ${fileItems.length} 个文件`);
  }

  /**
   * 处理拖拽进入
   */
  public handleDragEnter(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    useCloudStore.getState().setIsDragging(true);
  }

  /**
   * 处理拖拽悬停
   */
  public handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * 处理拖拽离开
   */
  public handleDragLeave(e: React.DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      useCloudStore.getState().setIsDragging(false);
    }
  }

  /**
   * 通过 input 选择文件
   */
  public handleFileSelect(e: React.ChangeEvent<HTMLInputElement>): void {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const fileItems: FileItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relativePath = (file as any).webkitRelativePath || file.name;
      fileItems.push(this.createFileItem(file, relativePath));
    }

    useCloudStore.getState().addFiles(fileItems);
    this._message?.success(`已添加 ${fileItems.length} 个文件`);
    e.target.value = '';
  }

  /**
   * 移除单个文件
   */
  public removeFile(id: string): void {
    useCloudStore.getState().removeFile(id);
  }

  /**
   * 清空所有文件
   */
  public clearFiles(): void {
    useCloudStore.getState().clearFiles();
  }

  // ===== 工具方法 =====

  /**
   * 清空所有内容
   */
  public clear(): void {
    this._text = '';
    this._password = '';
    this._queryPassword = '';

    this.clearFiles();
    useCloudStore.getState().reset();
    this._message?.success('已清空');
  }

  /**
   * 处理 URL 参数并自动查询
   */
  private async handleUrlParams() {
    if (typeof window === 'undefined') {
      return { autoQueried: false };
    }

    const urlParams = new URLSearchParams(window.location.search);
    const pwd = urlParams.get('pwd');

    if (pwd) {
      this.setQueryPassword(pwd);
      // 自动执行查询
      await this.queryMessage(pwd);
    }
  }
}

// 导出单例
export const neonCloud = new NeonCloud();
