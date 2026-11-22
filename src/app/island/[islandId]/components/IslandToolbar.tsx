'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { STICKER_PRESETS, StickerPreview, TAPE_PRESETS } from './StickerItem';
import { DOODLE_COLORS, DOODLE_SIZES, type DoodleBrushConfig } from './strokeUtils';
import styles from '../island-canvas.module.css';

interface IslandToolbarProps {
  canEdit: boolean;
  uploading: boolean;
  scale: number;
  doodleActive: boolean;
  doodleVisible: boolean;
  doodleBrush: DoodleBrushConfig;
  canUndoStroke: boolean;
  onToggleDoodle: () => void;
  onToggleDoodleVisible: () => void;
  onChangeDoodleBrush: (next: DoodleBrushConfig) => void;
  onUndoStroke: () => void;
  onAddNote: () => void;
  onAddCountdown: () => void;
  onAddChecklist: () => void;
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
  doodleActive,
  doodleVisible,
  doodleBrush,
  canUndoStroke,
  onToggleDoodle,
  onToggleDoodleVisible,
  onChangeDoodleBrush,
  onUndoStroke,
  onAddNote,
  onAddCountdown,
  onAddChecklist,
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
  const [widgetOpen, setWidgetOpen] = useState(false);

  const widgetContent = (
    <div className={styles.widgetMenu}>
      <Button
        variant="ghost"
        size="md"
        align="start"
        className="w-full"
        icon={<Icon name="calendar" tone="primary" />}
        onClick={() => {
          onAddCountdown();
          setWidgetOpen(false);
        }}
      >
        纪念日
      </Button>
      <Button
        variant="ghost"
        size="md"
        align="start"
        className="w-full"
        icon={<Icon name="check-circle" tone="primary" />}
        onClick={() => {
          onAddChecklist();
          setWidgetOpen(false);
        }}
      >
        共享清单
      </Button>
    </div>
  );

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
    <div className={styles.toolbarStack}>
      {doodleActive && canEdit ? (
        <div className={styles.doodleSubBar} role="toolbar" aria-label="涂鸦画笔工具栏">
          <div className={styles.doodleGroup} role="group" aria-label="涂鸦模式">
            <Tooltip title="拖选涂鸦（移动 / 缩放 / 删除）">
              <Button
                variant="ghost"
                size="sm"
                aria-label="拖选涂鸦"
                aria-pressed={doodleBrush.mode === 'select'}
                icon={<Icon name="select" size="sm" />}
                onClick={() => onChangeDoodleBrush({ ...doodleBrush, mode: 'select' })}
              />
            </Tooltip>
            <Tooltip title="钢笔">
              <Button
                variant="ghost"
                size="sm"
                aria-label="钢笔"
                aria-pressed={doodleBrush.mode === 'pen'}
                icon={<Icon name="edit" size="sm" />}
                onClick={() => onChangeDoodleBrush({ ...doodleBrush, mode: 'pen' })}
              />
            </Tooltip>
            <Tooltip title="荧光笔">
              <Button
                variant="ghost"
                size="sm"
                aria-label="荧光笔"
                aria-pressed={doodleBrush.mode === 'highlighter'}
                icon={<Icon name="palette" size="sm" />}
                onClick={() => onChangeDoodleBrush({ ...doodleBrush, mode: 'highlighter' })}
              />
            </Tooltip>
            <Tooltip title="橡皮擦（划过擦除笔迹）">
              <Button
                variant="ghost"
                size="sm"
                aria-label="橡皮擦"
                aria-pressed={doodleBrush.mode === 'eraser'}
                icon={<Icon name="clear" size="sm" />}
                onClick={() => onChangeDoodleBrush({ ...doodleBrush, mode: 'eraser' })}
              />
            </Tooltip>
          </div>

          {doodleBrush.mode === 'pen' || doodleBrush.mode === 'highlighter' ? (
            <>
              <span className={styles.toolbarDivider} aria-hidden="true" />
              <div className={styles.doodleGroup} role="group" aria-label="笔触粗细">
                {(['sm', 'md', 'lg'] as const).map((sizeKey) => (
                  <Tooltip key={sizeKey} title={DOODLE_SIZES[sizeKey].label}>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`粗细：${DOODLE_SIZES[sizeKey].label}`}
                      aria-pressed={doodleBrush.sizeKey === sizeKey}
                      onClick={() => onChangeDoodleBrush({ ...doodleBrush, sizeKey })}
                    >
                      <span
                        className={styles.brushSizeDot}
                        data-size={sizeKey}
                        aria-hidden="true"
                      />
                    </Button>
                  </Tooltip>
                ))}
              </div>

              <span className={styles.toolbarDivider} aria-hidden="true" />
              <div className={styles.doodleColorGroup} role="group" aria-label="涂鸦颜色">
                {DOODLE_COLORS.map((swatch) => (
                  <Button
                    key={swatch.color}
                    variant="ghost"
                    data-ui-surface=""
                    type="button"
                    className={styles.doodleColorBtn}
                    style={{ backgroundColor: swatch.color }}
                    data-active={doodleBrush.color === swatch.color ? 'true' : undefined}
                    aria-label={swatch.label}
                    aria-pressed={doodleBrush.color === swatch.color}
                    onClick={() => onChangeDoodleBrush({ ...doodleBrush, color: swatch.color })}
                  />
                ))}
              </div>
            </>
          ) : null}

          <span className={styles.toolbarDivider} aria-hidden="true" />
          <div className={styles.doodleGroup}>
            <Tooltip title={doodleVisible ? '隐藏涂鸦层' : '显示涂鸦层'}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={doodleVisible ? '隐藏涂鸦层' : '显示涂鸦层'}
                aria-pressed={!doodleVisible}
                icon={<Icon name={doodleVisible ? 'eye' : 'eye-invisible'} size="sm" />}
                onClick={onToggleDoodleVisible}
              />
            </Tooltip>
            <Tooltip title="撤销上一笔 (Ctrl/Cmd+Z)">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canUndoStroke}
                aria-label="撤销上一笔"
                icon={<Icon name="undo" size="sm" />}
                onClick={onUndoStroke}
              />
            </Tooltip>
            <Button
              variant="primary"
              size="sm"
              onClick={onToggleDoodle}
            >
              完成
            </Button>
          </div>
        </div>
      ) : null}

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
        open={canEdit && widgetOpen}
        onOpenChange={(next) => {
          if (canEdit) setWidgetOpen(next);
        }}
        fitViewport
        boundaryPadding={12}
        width="min(200px, calc(100vw - 24px))"
        content={widgetContent}
      >
        <Tooltip title={canEdit ? '纪念日与清单卡片' : '当前为只读模式'}>
          <Button
            variant="ghost"
            size="md"
            disabled={!canEdit}
            aria-label="添加纪念日或清单卡片"
            aria-expanded={widgetOpen}
            icon={<Icon name="appstore" />}
          />
        </Tooltip>
      </Popover>

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

      <Tooltip title={canEdit ? (doodleActive ? '退出涂鸦模式' : '自由涂鸦') : '当前为只读模式'}>
        <Button
          variant="ghost"
          size="md"
          disabled={!canEdit}
          aria-label="自由涂鸦"
          aria-pressed={doodleActive}
          icon={<Icon name="palette" />}
          onClick={onToggleDoodle}
        />
      </Tooltip>

      <span className={styles.toolbarDivider} aria-hidden="true" />

      <Tooltip title="缩小">
        <Button
          variant="ghost"
          size="sm"
          className={styles.desktopOnlyBtn}
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
          className={styles.desktopOnlyBtn}
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
    </div>
  );
}
