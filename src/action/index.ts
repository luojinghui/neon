export class CloudAPI {
  /**
   * 发送消息
   *
   * @param { string } text - 消息内容
   * @returns { Promise<any> } - 发送消息结果
   */
  static async sendMessage(text: string) {
    const res = await fetch('/api/cloud', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    return await res.json();
  }

  /**
   * 查询消息
   *
   * @param { string } password - 查询密码
   * @returns { Promise<any> } - 查询消息结果
   */
  static async queryMessage(password: string) {
    const res = await fetch(`/api/cloud?password=${encodeURIComponent(password)}`, { method: 'GET' });
    return await res.json();
  }
}
