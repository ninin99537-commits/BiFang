<template>
  <div class="w-group" :style="wrapStyle" :class="[{ 'no-border': style.groupBorder === false, 'layout-on': layoutOn }]" ref="rootRef">
    <div v-if="layoutOn" class="wg-container-tag">分组 · {{ totalChildren }} 项</div>
    <div v-if="widget.label && !hideTitle" class="w-group-title" :style="titleStyle">{{ widget.label }}</div>
    <div class="w-group-body" :class="'align-' + style.align" :style="bodyStyle">
      <template v-for="(rowBlock, ri) in rowBlocks" :key="rowBlock.row.id">
        <!-- 多列：分布 + 智能平分 -->
        <SmartEqualRow
          v-if="rowBlock.widgets.length > 1"
          class="w-group-row"
          cell-selector=".wg-cell"
          :gap="rowGap"
          :enabled="true"
          :row-align="rowBlock.row.rowAlign || 'between'"
          :smart-equal="rowBlock.row.smartEqual !== false"
          :deps="smartDeps(rowBlock)"
        >
          <div
            v-for="(child, ci) in rowBlock.widgets"
            :key="child.id"
            class="wg-cell"
            :class="{ 'is-on': layoutOn, 'is-divider': child.type === 'divider' }"
            :data-wg-group="widget.id"
            :data-wg-row="ri"
            :data-wg-cell="ci"
            :data-sb-drop="layoutOn ? JSON.stringify({ kind: 'group-cell', groupId: widget.id, row: ri, cell: ci }) : undefined"
          >
            <span
              v-if="layoutOn"
              class="wg-child-handle"
              title="按住拖动：组内换位 / 拖出分组 / 并入其它组"
              @pointerdown.stop="onChildPointerDown(ri, ci, child, $event)"
            >⠿</span>
            <WidgetRenderer :widget="child" />
          </div>
        </SmartEqualRow>
        <div v-else class="w-group-row is-single" :style="singleRowStyle">
          <div
            v-for="(child, ci) in rowBlock.widgets"
            :key="child.id"
            class="wg-cell"
            :class="{ 'is-on': layoutOn, 'is-divider': child.type === 'divider' }"
            :data-sb-drop="layoutOn ? JSON.stringify({ kind: 'group-cell', groupId: widget.id, row: ri ?? 0, cell: ci }) : undefined"
          >
            <span
              v-if="layoutOn"
              class="wg-child-handle"
              title="按住拖动：组内换位 / 拖出分组 / 并入其它组"
              @pointerdown.stop="onChildPointerDown(ri ?? 0, ci, child, $event)"
            >⠿</span>
            <WidgetRenderer :widget="child" />
          </div>
          <div
            v-if="layoutOn"
            class="wg-cell-placeholder"
            :data-sb-drop="JSON.stringify({ kind: 'group-end', groupId: widget.id, row: 0 })"
          >+ 并入本分组</div>
        </div>
      </template>
      <div v-if="rowBlocks.length === 0" class="w-group-empty">
        {{ layoutOn ? '(空分组 · 拖控件到此处移入)' : '(空分组，在编辑器中添加子控件)' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Widget } from '../schema';
import { useConfigStore } from '../store';
import { resolveStyle, baseWidgetCss, labelCss } from '../lib/style';
import { normalizeGroupRows } from '../lib/layout';
import { layoutMode, applyLayoutDrop } from '../lib/layoutMode';
import { bindPointerDrag, type DragPayload, type DropTarget } from '../lib/pointerDrag';
import { widgetTypedName } from '../lib/widgetName';
import WidgetRenderer from './WidgetRenderer.vue';
import SmartEqualRow from './SmartEqualRow.vue';

const props = withDefaults(defineProps<{ widget: Widget; hideTitle?: boolean }>(), {
  hideTitle: false,
});
const store = useConfigStore();
const style = computed(() => resolveStyle(store.config.layout, props.widget));
const rowGap = computed(() => Math.max(0, store.config.layout.gap ?? 0));

/** 全局布局开关：与 App / WidgetStack 共享 */
const layoutOn = computed(() => layoutMode.value);

const rootRef = ref<HTMLElement | null>(null);
let dragEl: HTMLElement | null = null;
function markDrag(el: EventTarget | null, on: boolean) {
  const node = (el as HTMLElement | null)?.closest?.('.wg-cell') as HTMLElement | null;
  if (on) {
    if (dragEl && dragEl !== node) dragEl.classList.remove('dragging');
    dragEl = node;
    node?.classList.add('dragging');
  } else {
    dragEl?.classList.remove('dragging');
    node?.classList.remove('dragging');
    dragEl = null;
  }
}

const rowBlocks = computed(() => {
  const live = store.config.widgets.find(w => w.id === props.widget.id) || props.widget;
  const rows = normalizeGroupRows(live);
  return rows.map(row => ({
    row,
    widgets: row.widgetIds
      .map(id => store.findWidget(id))
      .filter((w): w is Widget => !!w),
  }));
});
const totalChildren = computed(() => (props.widget.children || []).length);

/**
 * 组内子控件拖动手柄：按左上角 ⠿ 触发。
 * 落点由 pointerDrag 解析顶层 App 的 data-sb-drop（top-cell/top-end/into-group）+ 本组内 group-cell/group-end。
 */
function onChildPointerDown(row: number, cell: number, w: Widget, e: PointerEvent) {
  if (!layoutOn.value) return;
  const payload: DragPayload = {
    kind: 'child',
    groupId: props.widget.id,
    row,
    cell,
    widgetId: w.id,
  };
  const label = widgetTypedName(w, store.config.widgets);
  const started = bindPointerDrag(e, payload, label, (p: DragPayload, t: DropTarget) => {
    applyLayoutDrop(store, p, t);
    markDrag(null, false);
  });
  if (started) markDrag(e.currentTarget || e.target, true);
}
const wrapStyle = computed(() => {
  const s = style.value;
  const base = baseWidgetCss(s);
  const showBorder = s.groupBorder !== false;
  return {
    ...base,
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    border: showBorder ? '1px dashed currentColor' : 'none',
    borderWidth: showBorder ? undefined : '0',
    outline: 'none',
    boxShadow: showBorder ? undefined : 'none',
  } as Record<string, string | undefined>;
});
const bodyStyle = computed(() => ({
  gap: rowGap.value + 'px',
}) as Record<string, string>);
const titleStyle = computed(() => labelCss(style.value));
const singleRowStyle = computed(
  () =>
    ({
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      width: '100%',
      minWidth: 0,
      gap: rowGap.value + 'px',
    }) as Record<string, string>,
);

function smartDeps(rowBlock: { row: { rowAlign?: string; smartEqual?: boolean }; widgets: Widget[] }) {
  // 列数 / 数据刷新 / 标签 / 分布 / 智能平分 → 重测自然宽
  return [
    store.dataTick,
    rowBlock.row.rowAlign || 'between',
    rowBlock.row.smartEqual !== false,
    rowBlock.widgets.map(w => w.id).join(','),
    rowBlock.widgets.map(w => w.label).join('|'),
    rowBlock.widgets.map(w => w.type).join(','),
  ];
}
</script>

<style scoped>
.w-group {
  word-break: break-word;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.w-group.no-border {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
.w-group-title {
  margin-bottom: 6px;
  opacity: 0.9;
  line-height: 1.3;
  min-width: 0;
}
.w-group-body {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  justify-content: center;
  box-sizing: border-box;
}
.w-group-body.align-center {
  align-items: center;
}
.w-group-body.align-right {
  align-items: flex-end;
}
.w-group-body.align-left {
  align-items: stretch;
}
.w-group-row {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 1.35em;
  overflow: hidden;
  box-sizing: border-box;
  align-items: stretch;
}
/* 分组内图片撑满：renderer 与 image 一起 stretch，吃满同行高度 */
.w-group-row > :deep(.w-renderer:has(.w-image.is-stretch)) {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-height: 0;
}
.w-group-row > :deep(.w-renderer:has(.w-image.is-stretch) > .w-image.is-stretch) {
  flex: 1 1 auto;
  min-height: 0;
  align-self: stretch;
}
.w-group-row.is-single > :deep(*) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}
/* 进度条在单列行必须铺满，避免 track 宽度为 0 */
.w-group-row.is-single > :deep(.w-bar) {
  width: 100% !important;
  max-width: 100%;
}
.w-group-empty {
  opacity: 0.5;
  font-size: 0.9em;
}
/* 包装 cell：默认透明撑满；预览态仅是个无障碍包装 */
.wg-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.wg-cell > :deep(*) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.wg-cell.is-divider {
  flex-direction: row;
}

/* 布局态：分组容器轮廓 */
.w-group.layout-on {
  position: relative;
  outline: 1px dashed rgba(126, 201, 184, 0.55);
  outline-offset: 2px;
  border-radius: 10px;
  padding: 2px;
  background: rgba(126, 201, 184, 0.05);
}
.theme-dark .w-group.layout-on {
  outline-color: rgba(142, 197, 216, 0.55);
}
.wg-container-tag {
  position: absolute;
  top: -8px;
  left: 4px;
  z-index: 4;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  line-height: 1.3;
  color: var(--sb-accent, #7ec9b8);
  background: rgba(36, 48, 56, 0.7);
  border: 1px dashed rgba(126, 201, 184, 0.5);
  pointer-events: none;
  white-space: nowrap;
}
.theme-light .wg-container-tag {
  background: rgba(255, 255, 255, 0.85);
  color: #2f6f66;
  border-color: rgba(95, 173, 156, 0.5);
}
.wg-cell.is-on {
  outline: 1px dashed rgba(126, 201, 184, 0.45);
  outline-offset: 2px;
  border-radius: 6px;
}
.wg-cell.dragging {
  opacity: 0.45;
}
.wg-child-handle {
  position: absolute;
  top: -2px;
  left: -2px;
  z-index: 6;
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  color: #0f1a18;
  background: rgba(126, 201, 184, 0.92);
  border-radius: 8px 0 8px 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
}
.wg-child-handle:active {
  cursor: grabbing;
}
.wg-cell-placeholder {
  width: 100%;
  min-height: 30px;
  border: 1px dashed #8ec5d8;
  border-radius: 6px;
  color: #3d8a7a;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(228, 240, 235, 0.5);
  box-sizing: border-box;
}
.theme-dark .wg-cell-placeholder {
  border-color: #5a9a8e;
  color: #c5d8e0;
  background: rgba(126, 201, 184, 0.12);
}
</style>
