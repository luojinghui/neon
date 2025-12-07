/**
 * 内容编辑器组件
 *
 * Created at     : 2025-12-07 23:00:00
 * Last modified  : 2025-12-07 23:30:00
 */

import { Card, Button, Input } from 'antd';
import { ClearOutlined, CopyOutlined, FileTextOutlined, HistoryOutlined } from '@ant-design/icons';
import { useCloudStore } from '../store';
import { neonCloud } from '../core';

const { TextArea } = Input;

export default function ContentEditor() {
  // 直接从 store 获取状态
  const { text, queryPassword, textHistory } = useCloudStore((state) => ({
    text: state.text,
    queryPassword: state.queryPassword,
    textHistory: state.textHistory
  }));

  return (
    <Card
      title="发送内容"
      extra={
        <div className="flex items-center space-x-2">
          <Input
            placeholder="查询密码"
            maxLength={4}
            onChange={(e) => neonCloud.handleQueryPasswordChange(e)}
            value={queryPassword}
            className="h-8 w-[130px]"
            onPressEnter={() => neonCloud.queryMessage()}
          />
          <Button type="primary" onClick={() => neonCloud.queryMessage()}>
            查询
          </Button>
        </div>
      }
      className="w-full"
      styles={{
        body: { padding: '12px' },
        header: { padding: '8px 12px', minHeight: '40px' }
      }}
    >
      <TextArea autoSize={{ minRows: 10, maxRows: 24 }} showCount className="w-full" allowClear onChange={(e) => neonCloud.handleTextChange(e)} value={text} />
      <div className="flex flex-wrap gap-2 mt-4">
        <Button type="primary" onClick={() => neonCloud.sendMessage()}>
          发送
        </Button>
        <Button icon={<ClearOutlined />} onClick={() => neonCloud.clear()}>
          清空
        </Button>
        <Button icon={<CopyOutlined />} onClick={() => neonCloud.handleCopyText()} disabled={!text}>
          复制内容
        </Button>
        <Button icon={<FileTextOutlined />} onClick={() => neonCloud.parseJson()} disabled={!text}>
          JSON解析
        </Button>
        {textHistory.length > 0 && (
          <Button icon={<HistoryOutlined />} onClick={() => neonCloud.showHistoryModal()}>
            历史记录
          </Button>
        )}
      </div>
    </Card>
  );
}
