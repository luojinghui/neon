'use client';

import { Fragment, useState, type Key, type ReactNode } from 'react';
import { Button } from './button';
import { Icon } from './icon';
import { Spin } from './display';
import { cn } from '@/utils/cn';
import styles from './table.module.css';

export interface TableColumn<T> {
  title?: ReactNode;
  dataIndex?: keyof T & string;
  key?: string;
  width?: number;
  /** Truncate cell text with an ellipsis. */
  ellipsis?: boolean;
  /** Pin to the right edge while scrolling horizontally. */
  fixed?: 'right';
  render?: (value: any, record: T, index: number) => ReactNode;
}
/** Kept as an alias so call sites read like a column list. */
export type TableColumnsType<T> = TableColumn<T>[];

export interface TablePagination {
  current?: number;
  pageSize?: number;
  /** Supplied for server-side paging; omitted means the data is sliced locally. */
  total?: number;
  onChange?: (page: number) => void;
  showTotal?: (total: number) => ReactNode;
}
export interface TableProps<T> {
  rowKey: (keyof T & string) | ((record: T) => Key);
  columns: TableColumn<T>[];
  dataSource: T[];
  loading?: boolean;
  /** Minimum content width in px; the table scrolls horizontally below it. */
  scroll?: { x?: number };
  pagination?: TablePagination | false;
  expandable?: { expandedRowRender: (record: T) => ReactNode };
  locale?: { emptyText?: ReactNode };
  className?: string;
}

export function Table<T extends object>({ rowKey, columns, dataSource, loading, scroll, pagination, expandable, locale, className }: TableProps<T>) {
  const [localPage, setLocalPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<Key>>(new Set());
  const keyOf = (record: T): Key => typeof rowKey === 'function' ? rowKey(record) : record[rowKey] as Key;
  const pageSize = pagination ? pagination.pageSize ?? 10 : dataSource.length;
  const serverSide = !!pagination && pagination.total !== undefined;
  const total = pagination ? pagination.total ?? dataSource.length : dataSource.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pagination ? pagination.current ?? localPage : 1, pages);
  const rows = pagination && !serverSide ? dataSource.slice((current - 1) * pageSize, current * pageSize) : dataSource;
  const go = (page: number) => { setLocalPage(page); pagination && pagination.onChange?.(page); };
  const toggle = (key: Key) => setExpanded(previous => { const next = new Set(previous); if (!next.delete(key)) next.add(key); return next; });
  const span = columns.length + (expandable ? 1 : 0);

  return <div className={cn(styles.table, className)}>
    <Spin spinning={!!loading}>
      <div className={styles.scroller}>
        <table style={scroll?.x ? { minWidth: scroll.x } : undefined}>
          <thead><tr>
            {expandable && <th className={styles.expand} />}
            {columns.map((column, index) => <th key={column.key ?? column.dataIndex ?? index} style={column.width ? { width: column.width } : undefined} data-fixed={column.fixed}>{column.title}</th>)}
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={span} className={styles.empty}>{locale?.emptyText ?? '暂无数据'}</td></tr>}
            {rows.map((record, rowIndex) => {
              const key = keyOf(record);
              const open = expanded.has(key);
              return <Fragment key={key}>
                <tr>
                  {expandable && <td className={styles.expand}><Button variant="ghost" size="sm" iconOnly aria-label={open ? '收起' : '展开'} aria-expanded={open}
                    icon={<Icon name={open ? 'down' : 'right'} />} onClick={() => toggle(key)} /></td>}
                  {columns.map((column, index) => {
                    const value = column.dataIndex ? record[column.dataIndex] : undefined;
                    const content = column.render ? column.render(value, record, rowIndex) : value as ReactNode;
                    return <td key={column.key ?? column.dataIndex ?? index} data-fixed={column.fixed} data-ellipsis={column.ellipsis || undefined}>
                      {column.ellipsis ? <div className={styles.ellipsis}>{content}</div> : content}
                    </td>;
                  })}
                </tr>
                {expandable && open && <tr className={styles.detail}><td colSpan={span}>{expandable.expandedRowRender(record)}</td></tr>}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>
    </Spin>
    {pagination && total > 0 && <div className={styles.pager}>
      {pagination.showTotal && <span className={styles.total}>{pagination.showTotal(total)}</span>}
      <Button size="sm" iconOnly aria-label="上一页" icon={<Icon name="left" />} disabled={current <= 1} onClick={() => go(current - 1)} />
      <span className={styles.page}>{current} / {pages}</span>
      <Button size="sm" iconOnly aria-label="下一页" icon={<Icon name="right" />} disabled={current >= pages} onClick={() => go(current + 1)} />
    </div>}
  </div>;
}
