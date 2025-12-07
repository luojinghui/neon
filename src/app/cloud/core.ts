/**
 * 云传管理模块 - 核心业务逻辑层
 * 负责：业务逻辑、数据处理、与 Store 同步
 *
 * Created at     : 2025-12-07 22:37:37
 * Last modified  : 2025-12-07 23:38:00
 */

import { CloudAPI } from '@/action';
import { useCloudStore } from './store';
import { HISTORY_KEY, TEXT_HISTORY_KEY, MAX_HISTORY, MAX_TEXT_HISTORY } from '@/constants/cloud';
import { MessageInstance } from 'antd/es/message/interface';

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

    // 从 URL 解析密码并自动查询
    return await this.handleUrlParams();
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
   * 发送消息
   */
  public async sendMessage(): Promise<void> {
    if (!this._text) {
      this._message?.warning('请输入内容');
      return;
    }

    try {
      const data = await CloudAPI.sendMessage(this._text);

      if (data.state === 200) {
        this.setPassword(data.data.password);
        this.addToTextHistory(this._text);
        useCloudStore.getState().setShowContentInfo(true);

        this._message?.success('发送成功，请及时分享密码');
      } else {
        this._message?.error('发送失败');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      this._message?.error('发送失败，请重试');
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
        console.log('queryMessage', data);

        this.setText(data.data.text);
        this.addToQueryHistory(pwd);

        this._message?.success('查询成功');
      } else {
        this._message?.error('查询失败');
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

  // ===== 工具方法 =====

  /**
   * 清空所有内容
   */
  public clear(): void {
    this._text = '';
    this._password = '';
    this._queryPassword = '';
    useCloudStore.getState().reset();
    this._message?.success('内容已清空');
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
