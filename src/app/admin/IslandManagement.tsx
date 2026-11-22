'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClassName } from '@/components/ui/button';
import { Tag } from '@/components/ui/display';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Popconfirm } from '@/components/ui/popconfirm';
import { Table, type TableColumnsType } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { ImagePreview } from '@/components/image-viewer/ImagePreview';
import { formatInviteRemaining } from '@/app/island/core/client';
import type { IslandItem, NoteItemData, PolaroidItemData, StickerItemData, TapeItemData } from '@/app/island/core/types';
import { AdminApiError, adminRequest } from './client';
import type { AdminIslandDetail, AdminIslandSummary } from './types';

type Notice = { type: 'error' | 'success'; text: string } | null;

interface IslandManagementProps {
  refreshToken: number;
  onUnauthorized: () => void;
  setNotice: (notice: Notice) => void;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试';
}

function renderItemTypeTag(type: IslandItem['type']) {
  switch (type) {
    case 'note':
      return <Tag color="gold">便签</Tag>;
    case 'polaroid':
      return <Tag color="blue">拍立得</Tag>;
    case 'sticker':
      return <Tag color="purple">贴纸</Tag>;
    case 'tape':
      return <Tag color="green">胶带</Tag>;
    default:
      return <Tag>{type}</Tag>;
  }
}

function renderItemContent(item: IslandItem) {
  if (item.type === 'note') {
    const data = item.data as NoteItemData;
    return (
      <div className="text-body text-foreground">
        <span className="mr-2 rounded-sm bg-surface-inset px-1.5 py-0.5 text-caption text-foreground-muted">
          {data.color}
        </span>
        <span className="whitespace-pre-wrap break-words">{data.text || '（空便签）'}</span>
      </div>
    );
  }
  if (item.type === 'polaroid') {
    const data = item.data as PolaroidItemData;
    return (
      <div className="flex items-start gap-3">
        {data.imageUrl && (
          <ImagePreview
            images={[{ id: item.id, url: data.imageUrl, name: data.caption || '拍立得照片' }]}
            imageId={item.id}
            title="浮岛拍立得"
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.imageUrl}
              alt={data.caption || '拍立得照片'}
              className="h-14 w-14 rounded-md object-cover"
            />
          </ImagePreview>
        )}
        <div className="min-w-0">
          <div className="text-body text-foreground">{data.caption || '（无配文）'}</div>
          {data.dateLabel && <div className="mt-0.5 text-caption text-foreground-muted">{data.dateLabel}</div>}
        </div>
      </div>
    );
  }
  const preset = item.data as StickerItemData | TapeItemData;
  return <span className="font-mono text-caption text-foreground-secondary">预设：{preset.presetId || '—'}</span>;
}

export function IslandManagement({ refreshToken, onUnauthorized, setNotice }: IslandManagementProps) {
  const [items, setItems] = useState<AdminIslandSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<AdminIslandDetail | null>(null);
  const [actingKey, setActingKey] = useState('');

  const handleAuth = useCallback(
    (error: unknown) => {
      if (error instanceof AdminApiError && error.status === 401) onUnauthorized();
    },
    [onUnauthorized]
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await adminRequest<{ items: AdminIslandSummary[] }>('/islands');
      setItems(result.items || []);
    } catch (error) {
      handleAuth(error);
      const text = getErrorMessage(error);
      setLoadError(text);
      setNotice({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  }, [handleAuth, setNotice]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshToken]);

  const loadDetail = useCallback(
    async (islandId: string) => {
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailError('');
      try {
        const result = await adminRequest<{ island?: AdminIslandDetail } & Partial<AdminIslandDetail>>(
          `/islands/${encodeURIComponent(islandId)}`
        );
        const resolved = result.island ?? (result.id ? (result as AdminIslandDetail) : null);
        setDetail(resolved);
      } catch (error) {
        handleAuth(error);
        setDetailError(getErrorMessage(error));
      } finally {
        setDetailLoading(false);
      }
    },
    [handleAuth]
  );

  const handleDeleteItem = async (islandId: string, itemId: string) => {
    setActingKey(`item:${itemId}`);
    try {
      await adminRequest<void>(`/islands/${encodeURIComponent(islandId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE'
      });
      setNotice({ type: 'success', text: '画板物件已删除' });
      await Promise.all([loadDetail(islandId), loadList()]);
    } catch (error) {
      handleAuth(error);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setActingKey('');
    }
  };

  const handleRemoveMember = async (islandId: string, publicKey: string, name: string) => {
    setActingKey(`member:${publicKey}`);
    try {
      await adminRequest<void>(`/islands/${encodeURIComponent(islandId)}/members/${encodeURIComponent(publicKey)}`, {
        method: 'DELETE'
      });
      setNotice({ type: 'success', text: `已将访客「${name}」移出浮岛` });
      await Promise.all([loadDetail(islandId), loadList()]);
    } catch (error) {
      handleAuth(error);
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setActingKey('');
    }
  };

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.name, item.id, item.owner.name, item.owner.userId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [items, search]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          items: acc.items + item.itemCount,
          members: acc.members + item.memberCount,
          online: acc.online + item.onlineCount
        }),
        { items: 0, members: 0, online: 0 }
      ),
    [items]
  );

  const columns: TableColumnsType<AdminIslandSummary> = [
    {
      title: '浮岛',
      dataIndex: 'name',
      width: 190,
      render: (value: string, item) => (
        <div>
          <div className="font-medium text-foreground">{value}</div>
          <div className="mt-0.5 font-mono text-caption text-foreground-muted">{item.id}</div>
        </div>
      )
    },
    {
      title: '岛主',
      width: 180,
      render: (_, item) => (
        <div>
          <div className="text-body text-foreground">{item.owner.name}</div>
          <div className="font-mono text-caption text-foreground-muted">@{item.owner.userId}</div>
        </div>
      )
    },
    {
      title: '邀请链接有效期',
      width: 150,
      render: (_, item) => {
        const remaining = formatInviteRemaining(item.inviteExpiresAt);
        const expired = item.inviteExpired || remaining === '已过期';
        return <Tag color={expired ? 'error' : 'processing'}>{expired ? '已过期' : remaining || '有效'}</Tag>;
      }
    },
    {
      title: '成员 / 物件',
      width: 120,
      render: (_, item) => (
        <span className="text-body text-foreground-secondary">
          {item.memberCount} 人 / {item.itemCount} 件
        </span>
      )
    },
    {
      title: '在线',
      dataIndex: 'onlineCount',
      width: 72,
      render: (value: number) => (
        <span className={value > 0 ? 'font-medium text-success' : 'text-foreground-muted'}>{value}</span>
      )
    },
    { title: '最近更新', dataIndex: 'updatedAt', width: 174, render: formatDate },
    {
      title: '操作',
      fixed: 'right',
      width: 120,
      render: (_, item) => (
        <div className="flex items-center gap-1">
          <Tooltip title="在新窗口打开浮岛预览">
            <Link
              href={`/island/${encodeURIComponent(item.id)}`}
              target="_blank"
              aria-label={`打开浮岛 ${item.name} 预览`}
              className={buttonClassName({ variant: 'ghost', size: 'sm', iconOnly: true })}
            >
              <Icon name="global" size="sm" />
            </Link>
          </Tooltip>
          <Tooltip title="查看访客与画板物件">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`查看浮岛 ${item.name} 详情`}
              onClick={() => void loadDetail(item.id)}
              icon={<Icon name="eye" size="sm" />}
            />
          </Tooltip>
        </div>
      )
    }
  ];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title font-semibold text-foreground">全站浮岛数据</h2>
          <p className="mt-1 text-caption text-foreground-muted">
            共 {items.length} 座浮岛 · {totals.members} 人次访客 · {totals.items} 件画板物件 · 当前在线 {totals.online} 人
          </p>
        </div>
        <Input.Search
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索岛名、岛主或 ID"
          aria-label="搜索全站浮岛"
          className="w-full sm:w-64"
        />
      </div>

      {loadError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          message="浮岛数据加载失败"
          description={loadError}
          action={
            <Button variant="ghost" size="sm" onClick={() => void loadList()}>
              重试
            </Button>
          }
        />
      )}

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filteredItems}
        locale={{ emptyText: loadError ? '浮岛数据暂时不可用' : '暂无浮岛数据' }}
        scroll={{ x: 1120 }}
        pagination={{ pageSize: 20, showTotal: (count) => `共 ${count} 座` }}
      />

      <Modal
        title={detail ? `浮岛详情 · ${detail.name}` : '浮岛详情'}
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetail(null);
          setDetailError('');
        }}
        footer={null}
        centered
        width={780}
        destroyOnHidden
      >
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-body text-foreground-secondary">
            <Icon name="loading" tone="primary" /> 正在加载浮岛详情...
          </div>
        ) : detailError ? (
          <Alert type="error" showIcon message={detailError} />
        ) : detail ? (
          <div className="grid gap-5">
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface-inset p-4 text-body sm:grid-cols-3">
              <div>
                <div className="text-caption text-foreground-muted">岛主</div>
                <div className="mt-1 font-medium text-foreground">{detail.owner.name}</div>
                <div className="font-mono text-caption text-foreground-muted">@{detail.owner.userId}</div>
              </div>
              <div>
                <div className="text-caption text-foreground-muted">邀请有效期至</div>
                <div className="mt-1 text-caption text-foreground">{formatDate(detail.inviteExpiresAt)}</div>
              </div>
              <div className="flex items-center justify-end">
                <Link
                  href={`/island/${encodeURIComponent(detail.id)}`}
                  target="_blank"
                  className={buttonClassName({ variant: 'primary', size: 'sm' })}
                >
                  打开浮岛预览
                </Link>
              </div>
            </div>

            {/* 访客列表 */}
            <div>
              <h3 className="mb-2 text-body font-semibold text-foreground">
                已加入访客（{detail.members.length}）
              </h3>
              {detail.members.length === 0 ? (
                <div className="rounded-lg bg-surface-inset px-4 py-4 text-center text-caption text-foreground-muted">
                  暂无访客
                </div>
              ) : (
                <div className="grid max-h-48 gap-2 overflow-y-auto">
                  {detail.members.map((member) => {
                    const isOwnerMember = member.publicKey === detail.owner.publicKey;
                    return (
                      <div
                        key={member.publicKey}
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-body font-medium text-foreground">
                            <span className="truncate">{member.name}</span>
                            {isOwnerMember && <Tag color="processing">岛主</Tag>}
                          </div>
                          <div className="text-caption text-foreground-muted">
                            @{member.userId} · 加入于 {formatDate(member.joinedAt)}
                          </div>
                        </div>
                        {!isOwnerMember && (
                          <Popconfirm
                            title={`移除访客「${member.name}」？`}
                            description="移除后该用户将失去访问此浮岛的权限。"
                            okText="移除"
                            cancelText="取消"
                            onConfirm={() => void handleRemoveMember(detail.id, member.publicKey, member.name)}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={actingKey === `member:${member.publicKey}`}
                              icon={<Icon name="user-delete" size="sm" />}
                            >
                              移除
                            </Button>
                          </Popconfirm>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 画板物件列表 */}
            <div>
              <h3 className="mb-2 text-body font-semibold text-foreground">
                画板物件（{detail.items.length}）
              </h3>
              {detail.items.length === 0 ? (
                <div className="rounded-lg bg-surface-inset px-4 py-4 text-center text-caption text-foreground-muted">
                  画板上还没有物件
                </div>
              ) : (
                <div className="grid max-h-72 gap-2 overflow-y-auto">
                  {detail.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                    >
                      <div className="min-w-0 flex-1 grid gap-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-caption text-foreground-muted">
                          {renderItemTypeTag(item.type)}
                          <span>作者：{item.authorName}</span>
                          <span>更新：{formatDate(item.updatedAt)}</span>
                        </div>
                        {renderItemContent(item)}
                      </div>
                      <Popconfirm
                        title="删除这个画板物件？"
                        description="删除后画板上将立即移除该物件，不可恢复。"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => void handleDeleteItem(detail.id, item.id)}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="删除画板物件"
                          loading={actingKey === `item:${item.id}`}
                          icon={<Icon name="trash" size="sm" />}
                        />
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
