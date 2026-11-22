'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { STICKER_PRESETS, StickerPreview, TAPE_PRESETS } from './StickerItem';
import styles from '../island-canvas.module.css';

interface IslandToolbarProps {
  canEdit: boolean;
  uploading: boolean;
  scale: number;
  onAddNote: () => void;
  onUploadFiles: (files: File[]) => void;
  onAddSticker: (presetId: string) => void;
  onAddTape: (presetId: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onResetView: () => void;
}

export function IslandToolbar({
  canEdit,
  uploading,
  scale,
  onAddNote,
  onUploadFiles,
  onAddSticker,
  onAddTape,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onResetView
}: IslandToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickerContent = (
    <div className={styles.pickerContent}>
      <div>
        <p className={styles.pickerSectionTitle}>小贴纸</p>
        <div className={styles.stickerGrid}>
          {STICKER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="ghost"
              data-ui-surface=""
              type="button"
              className={styles.stickerPickBtn}
              onClick={() => {
                onAddSticker(preset.id);
                setPickerOpen(false);
              }}
            >
              <StickerPreview type="sticker" presetId={preset.id} />
              <span>{preset.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className={styles.pickerSectionTitle}>和纸胶带</p>
        <div className={styles.tapeGrid}>
          {TAPE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="ghost"
              data-ui-surface=""
              type="button"
              className={styles.tapePickBtn}
              onClick={() => {
                onAddTape(preset.id);
                setPickerOpen(false);
              }}
            >
              <StickerPreview type="tape" presetId={preset.id} />
              <span>{preset.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.toolbarDock} role="toolbar" aria-label="浮岛画板工具栏">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          if (files.length) onUploadFiles(files);
        }}
      />

      <Tooltip title={canEdit ? '新增便利贴' : '当前为只读模式'}>
        <Button
          variant="ghost"
          size="md"
          disabled={!canEdit}
          aria-label="新增便利贴"
          icon={<Icon name="edit" />}
          onClick={onAddNote}
        />
      </Tooltip>

      <Tooltip title={canEdit ? '上传拍立得照片' : '当前为只读模式'}>
        <Button
          variant="ghost"
          size="md"
          disabled={!canEdit}
          loading={uploading}
          aria-label="上传拍立得照片"
          icon={<Icon name="picture" />}
          onClick={() => fileInputRef.current?.click()}
        />
      </Tooltip>

      <Popover
        trigger="click"
        placement="top"
        open={canEdit && pickerOpen}
        onOpenChange={(next) => {
          if (canEdit) setPickerOpen(next);
        }}
        fitViewport
        boundaryPadding={12}
        width="min(312px, calc(100vw - 24px))"
        content={pickerContent}
      >
        <Tooltip title={canEdit ? '贴纸与和纸胶带' : '当前为只读模式'}>
          <Button
            variant="ghost"
            size="md"
            disabled={!canEdit}
            aria-label="贴纸与和纸胶带"
            aria-expanded={pickerOpen}
            icon={<Icon name="smile" />}
          />
        </Tooltip>
      </Popover>

      <span className={styles.toolbarDivider} aria-hidden="true" />

      <Tooltip title="缩小">
        <Button
          variant="ghost"
          size="sm"
          aria-label="缩小画布"
          icon={<Icon name="zoom-out" size="sm" />}
          onClick={onZoomOut}
        />
      </Tooltip>

      <Tooltip title="重置为 100%">
        <Button
          variant="ghost"
          size="sm"
          aria-label="重置缩放为 100%"
          className={styles.zoomLabel}
          onClick={onResetZoom}
        >
          {Math.round(scale * 100)}%
        </Button>
      </Tooltip>

      <Tooltip title="放大">
        <Button
          variant="ghost"
          size="sm"
          aria-label="放大画布"
          icon={<Icon name="zoom-in" size="sm" />}
          onClick={onZoomIn}
        />
      </Tooltip>

      <span className={styles.toolbarDivider} aria-hidden="true" />

      <Tooltip title="回到岛心">
        <Button
          variant="ghost"
          size="md"
          aria-label="回到岛心"
          icon={<Icon name="aim" />}
          onClick={onResetView}
        />
      </Tooltip>
    </div>
  );
}
