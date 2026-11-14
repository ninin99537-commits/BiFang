<template>
  <div
    ref="rootEl"
    class="sb-root is-chat-mounted"
    :class="{
      'has-editor': editing,
      'has-layout': layoutMode,
      'theme-dark': isDark,
      'theme-light': !isDark,
      'is-narrow': isNarrow,
    }"
    :style="rootStyle"
  >
    <div class="sb-fab-row">
      <div class="sb-fab" :class="{ layout: layoutMode, editor: editing }">
        <button
          type="button"
          class="sb-edit-btn"
          :class="{ active: layoutMode }"
          @click="toggleLayout"
          title="布局调整"
        ><span class="sb-edit-ico" aria-hidden="true">⊞</span></button>
        <button
          type="button"
          class="sb-edit-btn"
          :class="{ active: editing }"
          @click="toggleEditor"
          title="编辑状态栏"
        ><span class="sb-edit-ico" aria-hidden="true">⚙</span></button>
      </div>
    </div>

    <div class="sb-body">
      <div class="sb-main">
        <div class="sb-toolbar" v-if="layoutMode">
          <span class="sb-toolbar-tip">拖到「+」并排 · 拖到分组标题移入 · 分组内拖出到行 · 手机空白处可滑 · 拖控件靠边缘自动滚</span>
          <button class="sb-toolbar-btn" @click="store.addRow(1)">+ 空行</button>
          <button class="sb-toolbar-btn primary" @click="layoutMode = false">完成布局</button>
        </div>

        <div ref="rowsEl" class="sb-rows" :style="rowsStyle" @wheel="onRowsWheel">
          <div
            v-for="(rowBlock, ri) in rowBlocks"
            :key="rowBlock.row.id"
            class="sb-row"
            :class="{
              'layout-active': layoutMode,
              'is-empty-row': layoutMode && rowBlock.widgets.length === 0,
              'is-collapsed': rowBlock.row.collapsed,
            }"
            :style="rowOuterStyle(rowBlock.row, rowBlock.widgets.length, layoutMode)"
            :data-sb-drop="layoutMode ? JSON.stringify({ kind: 'top-end', row: ri }) : undefined"
          >
            <div v-if="layoutMode" class="sb-row-meta">
              <button
                type="button"
                class="sb-row-fold"
                :title="rowBlock.row.collapsed ? '展开本行' : '折叠本行'"
                @click="store.toggleRowCollapsed(ri)"
              >
                {{ rowBlock.row.collapsed ? '▸' : '▾' }}
              </button>
              <span>第 {{ ri + 1 }} 行</span>
              <button class="sb-row-ord" title="上移" :disabled="ri === 0" @click="store.reorderRow(ri, ri - 1)">↑</button>
              <button
                class="sb-row-ord"
                title="下移"
                :disabled="ri === rowBlocks.length - 1"
                @click="store.reorderRow(ri, ri + 1)"
              >
                ↓
              </button>
              <button class="sb-row-del" title="删除行" @click="store.removeRow(ri)">✕</button>
              <span class="sb-row-cols-hint">{{ Math.max(rowBlock.widgets.length, 1) }} 列</span>
            </div>

            <!-- 折叠：仅收起拖拽区；预览始终渲染 -->
            <template v-if="!layoutMode || !rowBlock.row.collapsed">
              <!-- 多列：预览与布局均走 SmartEqualRow，保证布局态也是真实多列布局 -->
              <SmartEqualRow
                v-if="rowBlock.widgets.length > 1"
                class="sb-row-cells"
                cell-selector=".sb-cell"
                :gap="store.config.layout.gap"
                :enabled="true"
                :row-align="rowBlock.row.rowAlign || 'between'"
                :smart-equal="rowBlock.row.smartEqual !== false"
                :deps="[store.dataTick, rowBlock.row.rowAlign, rowBlock.row.smartEqual, rowBlock.widgets.map(w => w.id + ':' + w.name + ':' + w.label + ':' + w.type).join(',')]"
              >
                <div
                  v-for="(w, ci) in rowBlock.widgets"
                  :key="w.id"
                  class="sb-cell"
                  :class="cellClass(w, layoutMode)"
                  :data-sb-drop="cellDrop(w, ri, ci, layoutMode)"
                >
                  <span
                    v-if="layoutMode"
                    class="sb-inline-handle"
                    :title="(w.type === 'group' || w.type === 'stack') ? '拖动整个容器' : '拖动控件'"
                    @pointerdown.stop="onTopPointerDown(ri, ci, w, $event)"
                  >⠿</span>
                  <WidgetRenderer :widget="w" />
                </div>
              </SmartEqualRow>
              <template v-else>
                <div
                  v-for="(w, ci) in rowBlock.widgets"
                  :key="w.id"
                  class="sb-cell"
                  :class="cellClass(w, layoutMode)"
                  :data-sb-drop="cellDrop(w, ri, ci, layoutMode)"
                >
                  <span
                    v-if="layoutMode"
                    class="sb-inline-handle"
                    :title="(w.type === 'group' || w.type === 'stack') ? '拖动整个容器' : '拖动控件'"
                    @pointerdown.stop="onTopPointerDown(ri, ci, w, $event)"
                  >⠿</span>
                  <WidgetRenderer :widget="w" />
                </div>

                <div
                  v-if="layoutMode && rowBlock.widgets.length < 6"
                  class="sb-cell-placeholder"
                  :data-sb-drop="JSON.stringify({ kind: 'top-end', row: ri })"
                >
                  {{ rowBlock.widgets.length === 0 ? '拖到这里放入本行' : '+ 并入本行' }}
                </div>
              </template>
            </template>
            <div v-else class="sb-row-collapsed-tip">
              已折叠 · {{ rowBlock.widgets.length }} 个控件
            </div>

            <div v-if="rowBlock.widgets.length === 0 && !layoutMode" class="sb-row-empty"></div>
          </div>

          <div v-if="store.config.widgets.length === 0" class="sb-empty">
            状态栏为空，点击右上角 ⚙ 添加数据
          </div>
        </div>
      </div>

      <EditorPanel v-if="editing" @close="editing = false" @request-layout="onRequestLayout" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useConfigStore } from './store';
import { Widget, LayoutRow, withOpacity, isDarkColor } from './schema';
import { widgetsByRow, rowGridTemplate, rowMarginStyle } from './lib/layout';
import { layoutMode, applyLayoutDrop } from './lib/layoutMode';
import {
  bindPointerDrag,
  forceStopAllDrag,
  setDragScrollRoot,
  type DragPayload,
  type DropTarget,
} from './lib/pointerDrag';
import { widgetTypedName } from './lib/widgetName';
import WidgetRenderer from './components/WidgetRenderer.vue';
import EditorPanel from './components/EditorPanel.vue';
import SmartEqualRow from './components/SmartEqualRow.vue';

const store = useConfigStore();
const editing = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const rowsEl = ref<HTMLElement | null>(null);
/** iframe 内宽度 < 520 视为窄屏（手机 / 侧栏） */
const isNarrow = ref(false);
/** 根容器宽度，驱动子控件在缩窄时重新布局/截断 */
const rootWidth = ref(0);

/**
 * 拖拽源用非响应式变量：HTML5 drag 过程中改 ref 会触发整树重渲卡死。
 * 视觉半透明用 classList 直接改 DOM。
 */
let dragEl: HTMLElement | null = null;

function markDragEl(el: EventTarget | null, on: boolean) {
  const node = el as HTMLElement | null;
  const cell = node?.closest?.('.sb-cell') as HTMLElement | null;
  if (on) {
    if (dragEl && dragEl !== cell) dragEl.classList.remove('dragging');
    dragEl = cell;
    cell?.classList.add('dragging');
  } else {
    dragEl?.classList.remove('dragging');
    cell?.classList.remove('dragging');
    dragEl = null;
  }
}

const rowBlocks = computed(() => widgetsByRow(store.config.layout.rows, store.config.widgets));
const isDark = computed(() => isDarkColor(store.config.layout.bg));

let rootRo: ResizeObserver | null = null;
function updateNarrow() {
  const w = rootEl.value?.clientWidth || 0;
  rootWidth.value = w;
  isNarrow.value = w > 0 && w < 520;
  // 通知子树：容器宽度变了，chip/文本按当前可用宽度截断
  if (rootEl.value) {
    rootEl.value.style.setProperty('--sb-root-w', w + 'px');
    // 强制一次 reflow，避免打开侧栏/缩放后仍按旧内容宽布局
    void rootEl.value.offsetWidth;
  }
}

onMounted(() => {
  updateNarrow();
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    rootRo = new ResizeObserver(() => updateNarrow());
    rootRo.observe(rootEl.value);
  }
  window.addEventListener('resize', updateNarrow);
  nextTick(() => setDragScrollRoot(rowsEl.value));
});
onBeforeUnmount(() => {
  rootRo?.disconnect();
  rootRo = null;
  window.removeEventListener('resize', updateNarrow);
  setDragScrollRoot(null);
  forceStopAllDrag();
});

const rootStyle = computed(() => {
  const l = store.config.layout;
  const bg = withOpacity(l.bg, l.bgOpacity ?? 1);
  const color = withOpacity(l.textColor, l.textOpacity ?? 1);
  const dark = isDark.value;
  return {
    background: bg,
    border: l.border,
    borderRadius: l.radius + 'px',
    padding: l.padding + 'px',
    color,
    fontFamily: l.fontFamily,
    minHeight: editing.value ? (isNarrow.value ? '200px' : '280px') : layoutMode.value ? '160px' : undefined,
    height: 'auto',
    maxHeight: 'none',
    '--sb-accent': l.accentColor || (dark ? '#7ec9b8' : '#5fad9c'),
    '--sb-scrollbar':
      l.scrollbarColor ||
      (dark ? 'rgba(126, 201, 184, 0.42)' : 'rgba(95, 173, 156, 0.4)'),
    '--sb-scrollbar-hover':
      l.scrollbarHoverColor ||
      (dark ? 'rgba(142, 197, 216, 0.72)' : 'rgba(232, 180, 160, 0.72)'),
    /* 编辑器 range 滑块：与全局滚动条/强调色同源，可在「全局 → 颜色」调 */
    '--sb-range-track':
      (l.editorRangeTrack || '').trim() ||
      l.scrollbarColor ||
      (dark ? 'rgba(94, 170, 184, 0.28)' : 'rgba(107, 143, 134, 0.22)'),
    '--sb-range-thumb':
      (l.editorRangeThumb || '').trim() || l.accentColor || (dark ? '#7ec9b8' : '#5fad9c'),
    '--sb-range-thumb-hover':
      (l.editorRangeThumbHover || '').trim() ||
      l.scrollbarHoverColor ||
      (dark ? 'rgba(142, 197, 216, 0.85)' : 'rgba(232, 180, 160, 0.8)'),
  } as Record<string, string | undefined>;
});

/** 可视化布局用固定行距，不受全局 gap / 行上下边距影响 */
const LAYOUT_MODE_ROW_GAP = 8;

const rowsStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as const,
  // 布局模式固定间距；预览模式才跟 layout.gap
  gap: (layoutMode.value ? LAYOUT_MODE_ROW_GAP : store.config.layout.gap) + 'px',
  maxHeight: layoutMode.value ? (isNarrow.value ? '420px' : '560px') : undefined,
  overflowY: layoutMode.value ? ('auto' as const) : undefined,
  boxSizing: 'border-box' as const,
  minHeight: 0,
}));

function rowOuterStyle(row: LayoutRow, widgetCount: number, inLayout = false) {
  void rootWidth.value;
  const n = Math.max(0, widgetCount);
  const gap = store.config.layout.gap + 'px';
  const margin = rowMarginStyle(row);
  // 预览多列由 SmartEqualRow 管列宽；外层只堆叠 meta/cells
  if (!inLayout && n > 1) {
    return {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '0',
      width: '100%',
      minWidth: 0,
      boxSizing: 'border-box' as const,
      ...margin,
    } as Record<string, string>;
  }
  // 可视化布局：固定间距/无行 margin，仅作拖拽结构预览
  if (inLayout) {
    return {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'stretch',
      gap: '6px',
      width: '100%',
      minWidth: 0,
      boxSizing: 'border-box' as const,
    } as Record<string, string>;
  }
  return {
    display: 'grid',
    gridTemplateColumns: rowGridTemplate(row, n, { extraPlaceholder: false }),
    gridAutoRows: 'auto',
    alignItems: 'start',
    alignContent: 'start',
    justifyContent: 'stretch',
    gap,
    width: '100%',
    ...margin,
  } as Record<string, string>;
}

/** 布局模式下允许滚轮滚动行列表（拖拽区 touch-action:none 会吞滚动） */
function onRowsWheel(e: WheelEvent) {
  if (!layoutMode.value) return;
  const el = rowsEl.value;
  if (!el) return;
  // 若事件目标在可滚动子区域且还能滚，则放行
  const t = e.target as HTMLElement | null;
  let cur: HTMLElement | null = t;
  while (cur && cur !== el) {
    const oy = getComputedStyle(cur).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 1) {
      return;
    }
    cur = cur.parentElement;
  }
  if (el.scrollHeight <= el.clientHeight + 1) return;
  e.preventDefault();
  el.scrollTop += e.deltaY;
}

function applyDrop(payload: DragPayload, target: DropTarget) {
  applyLayoutDrop(store, payload, target);
}

/**
 * 顶层控件的拖动入口：仅「左上角 ⠿ 手柄」会触发（模板里用 @pointerdown.stop 绑在手柄上），
 * 故此处无需再做「点到了按钮/标题条就放弃」的判断——手柄本身就是专用触发点。
 * group/stack 也走这里（整组作为一个顶层控件移动 / 换行 / 拖入别的空位或容器）。
 */
function onTopPointerDown(row: number, cell: number, w: Widget, e: PointerEvent) {
  if (!layoutMode.value) return;
  const payload: DragPayload = { kind: 'top', row, cell, widgetId: w.id };
  const label = widgetTypedName(w, store.config.widgets);
  const started = bindPointerDrag(e, payload, label, (p, t) => {
    applyDrop(p, t);
    markDragEl(null, false);
  });
  if (started) markDragEl(e.currentTarget || e.target, true);
}

function cellClass(w: Widget, inLayout: boolean) {
  const base: Record<string, boolean> = {
    'layout-cell': inLayout,
    'group-cell': inLayout && (w.type === 'group' || w.type === 'stack'),
    'is-divider': w.type === 'divider',
    'is-img-stretch': w.type === 'image' && w.style?.imgStretch,
  };
  return base;
}

function cellDrop(w: Widget, row: number, cell: number, inLayout: boolean): string | undefined {
  if (!inLayout) return undefined;
  // 容器控件：整格都是「移入该容器」落点；普通控件：落到本格位置
  if (w.type === 'group' || w.type === 'stack') {
    return JSON.stringify({ kind: 'into-group', groupId: w.id });
  }
  return JSON.stringify({ kind: 'top-cell', row, cell });
}

function onDragEnd() {
  markDragEl(null, false);
  forceStopAllDrag();
}

function toggleLayout() {
  forceStopAllDrag();
  markDragEl(null, false);
  layoutMode.value = !layoutMode.value;
  if (layoutMode.value) editing.value = false;
  nextTick(() => {
    updateNarrow();
    setDragScrollRoot(rowsEl.value);
  });
}
function toggleEditor() {
  forceStopAllDrag();
  markDragEl(null, false);
  editing.value = !editing.value;
  if (editing.value) layoutMode.value = false;
  nextTick(() => {
    updateNarrow();
    setDragScrollRoot(rowsEl.value);
  });
}
function onRequestLayout() {
  editing.value = false;
  layoutMode.value = true;
  nextTick(() => {
    updateNarrow();
    setDragScrollRoot(rowsEl.value);
  });
}
</script>

<style scoped>
.sb-root {
  position: relative;
  width: 100%;
  min-height: 48px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: visible;
  scrollbar-width: thin;
  scrollbar-color: var(--sb-scrollbar, rgba(95, 173, 156, 0.4)) transparent;
}
.sb-root.sb-peeking {
  z-index: 40;
}
.sb-root.sb-peeking {
  z-index: 40;
}
/* 聊天流内挂载：编辑/布局时不限制高度 */
.sb-root.is-chat-mounted.has-editor,
.sb-root.is-chat-mounted.has-layout {
  max-height: none;
}
.sb-root.is-chat-mounted .sb-body {
  max-height: none;
}
.sb-root ::-webkit-scrollbar,
.sb-rows::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.sb-root ::-webkit-scrollbar-track,
.sb-rows::-webkit-scrollbar-track {
  background: transparent;
}
.sb-root ::-webkit-scrollbar-thumb,
.sb-rows::-webkit-scrollbar-thumb {
  background: var(--sb-scrollbar, rgba(95, 173, 156, 0.4));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.sb-root ::-webkit-scrollbar-thumb:hover,
.sb-rows::-webkit-scrollbar-thumb:hover {
  background: var(--sb-scrollbar-hover, rgba(95, 173, 156, 0.65));
  background-clip: padding-box;
}
.sb-fab-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
  min-height: 26px;
  margin-bottom: 4px;
  box-sizing: border-box;
}
.sb-fab {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  padding: 2px 3px;
  border-radius: 999px;
  background: rgba(127, 140, 141, 0.12);
  border: 1px solid rgba(127, 140, 141, 0.22);
  box-sizing: border-box;
  line-height: 0;
}
.sb-body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: auto;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  width: 100%;
  gap: 0;
}
/* 窄屏：编辑器改纵向全宽，避免 42% 侧栏把预览挤没 */
.sb-root.is-narrow .sb-body {
  flex-direction: column;
  align-items: stretch;
}
.sb-root.has-editor .sb-body {
  min-height: 200px;
  max-height: none;
  height: auto;
  align-items: stretch;
}
.sb-root.is-narrow.has-editor .sb-body {
  min-height: 0;
}
.sb-main {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: auto;
}
.sb-root.is-narrow.has-editor .sb-main {
  flex: 0 0 auto;
  max-height: 220px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  border-bottom: 1px solid rgba(126, 201, 184, 0.25);
  padding-bottom: 6px;
  margin-bottom: 4px;
}
.sb-root.has-editor {
  min-height: 280px;
  height: auto;
  max-height: none;
}
.sb-root.is-narrow.has-editor {
  min-height: 0;
}
.sb-root.has-layout {
  min-height: 200px;
  height: auto;
  max-height: none;
}
.sb-root.is-narrow.has-layout {
  min-height: 160px;
}
.sb-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: rgba(95, 173, 156, 0.12);
  border: 1px dashed #8ec5d8;
  border-radius: 12px;
  font-size: 12px;
  flex-shrink: 0;
}
.theme-dark .sb-toolbar {
  background: rgba(126, 201, 184, 0.14);
  border-color: #5a9a8e;
}
.sb-toolbar-tip {
  flex: 1;
  min-width: 100px;
  color: #4a7a6e;
}
.theme-dark .sb-toolbar-tip {
  color: #c5d8e0;
}
.sb-toolbar-btn {
  border: 1px solid #c5ddd4;
  background: #fff;
  color: #2c4a42;
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
}
.theme-dark .sb-toolbar-btn {
  background: #1f2833;
  border-color: #4a8a80;
  color: #e4eef2;
}
.sb-toolbar-btn.primary {
  background: #5fad9c;
  color: #fff;
  border-color: #5fad9c;
}
.theme-dark .sb-toolbar-btn.primary {
  background: #6ebfb0;
  border-color: #6ebfb0;
  color: #0f1a18;
}
.theme-light .sb-fab {
  background: rgba(95, 173, 156, 0.12);
  border-color: rgba(95, 173, 156, 0.28);
}
.theme-light .sb-edit-btn {
  background: rgba(95, 173, 156, 0.18);
}
.theme-light .sb-row.layout-active {
  background: rgba(228, 240, 235, 0.55);
  outline-color: rgba(95, 173, 156, 0.45);
}
.theme-light .sb-cell.layout-cell {
  background: rgba(255, 255, 255, 0.72);
  outline-color: rgba(95, 173, 156, 0.35);
}
.theme-light .sb-cell-placeholder {
  border-color: #b0d8c8;
  color: #4a7a6e;
  background: rgba(238, 245, 242, 0.85);
}
.sb-rows {
  width: 100%;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--sb-scrollbar, rgba(95, 173, 156, 0.4)) transparent;
  /* 布局模式下 touch-action 在子节点为 none；此区需可滚 */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.sb-row {
  min-height: 8px;
  flex-shrink: 0;
  position: relative;
  width: 100%;
  box-sizing: border-box;
}
.sb-row.layout-active {
  outline: 1px dashed rgba(126, 201, 184, 0.55);
  outline-offset: 2px;
  border-radius: 8px;
  padding: 6px;
  margin: 2px 0;
  background: rgba(228, 240, 235, 0.4);
}
.theme-dark .sb-row.layout-active {
  outline-color: rgba(142, 197, 216, 0.55);
  background: rgba(126, 201, 184, 0.1);
}
.sb-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #4b5563;
  margin-bottom: 4px;
  min-height: 26px;
  height: 26px;
  line-height: 1;
  position: relative;
  z-index: 1;
  flex-wrap: nowrap;
  box-sizing: border-box;
}
.sb-row-fold {
  border: none;
  background: #d8efe9;
  color: #2f6f66;
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.theme-dark .sb-row-fold {
  background: #2a4a48;
  color: #c8ebe2;
}
.sb-row-collapsed-tip {
  font-size: 11px;
  opacity: 0.65;
  padding: 4px 2px;
}
.sb-row.is-collapsed.layout-active {
  min-height: 0;
}
.sb-row-meta > span,
.sb-row-meta > label {
  display: inline-flex;
  align-items: center;
  height: 22px;
  line-height: 1;
}
.sb-root.is-narrow .sb-row-meta {
  gap: 6px;
}
.sb-root.is-narrow .sb-toolbar-tip {
  flex: 1 1 100%;
  min-width: 0;
}
.sb-root.is-narrow .sb-edit-btn {
  width: 26px;
  height: 26px;
  font-size: 12px;
  opacity: 0.9;
}
.sb-root.is-narrow .sb-fab-row {
  min-height: 30px;
  margin-bottom: 4px;
}
.sb-root.is-narrow .sb-cell.layout-cell {
  min-height: 32px;
}
/* 窄屏编辑器：必须在 App 用 :deep，子组件 :global 对宿主 class 不可靠 */
.sb-root.is-narrow :deep(.ep-drawer) {
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: none !important;
  min-height: 280px;
  border-left: none !important;
  border-top: 1px solid rgba(126, 201, 184, 0.35);
  box-shadow: none !important;
}
.sb-root.is-narrow :deep(.ep-body) {
  max-height: 420px;
}
.sb-root.is-narrow :deep(.ep-form) {
  grid-template-columns: 64px minmax(0, 1fr) auto;
}
.sb-root.is-narrow :deep(.dp-overlay) {
  padding: 4px;
  align-items: stretch;
}
.sb-root.is-narrow :deep(.dp-modal) {
  max-width: none;
  height: 100%;
  max-height: none;
}
.theme-dark .sb-row-meta {
  color: #b8c9c4;
}
.sb-row-cols-hint {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.65;
  padding-left: 4px;
  white-space: nowrap;
}
.sb-row-ord {
  border: none;
  background: #d8efe9;
  color: #2f6f66;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex-shrink: 0;
}
.theme-dark .sb-row-ord {
  background: #2a4a48;
  color: #c8ebe2;
}
.sb-row-ord:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sb-row-del {
  margin-left: auto;
  border: none;
  background: #fee2e2;
  color: #b91c1c;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  flex-shrink: 0;
}
.theme-dark .sb-row-del {
  background: #4a2a2a;
  color: #fca5a5;
}
.sb-row-cells {
  width: 100%;
  min-width: 0;
}
.sb-cell {
  /* 下限：防止多列被邻列压到看不见 */
  min-width: 48px;
  min-height: 1.35em;
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.sb-cell.is-divider {
  align-items: stretch;
  min-width: 8px;
}
/* 图片撑满行高：cell 跟同行最高项对齐；用 flex 传高，避免 height:100% 在父级未定时塌成 0 */
.sb-cell.is-img-stretch {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  min-height: 0;
  overflow: hidden;
}
.sb-cell.is-img-stretch > * {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  align-self: stretch;
}
.sb-cell > :deep(*) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}
/* 布局态：真实渲染控件，仅加可拖提示与落点轮廓；不锁本体 touch-action，
   让控件自身的点击/页签切换等交互在布局态照常可用 */
.sb-cell.layout-cell {
  outline: 1px dashed rgba(126, 201, 184, 0.45);
  outline-offset: 2px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  padding: 4px;
  min-height: 36px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.theme-dark .sb-cell.layout-cell {
  outline-color: rgba(142, 197, 216, 0.5);
  background: rgba(126, 201, 184, 0.06);
}
.sb-cell.dragging {
  opacity: 0.45;
}
.sb-cell.group-cell {
  padding: 6px;
  min-width: 0;
}
.sb-row.is-empty-row {
  min-height: 52px;
}
.sb-row.is-empty-row .sb-cell-placeholder {
  min-height: 44px;
}

/* 左上角 ⠿ 拖手柄：唯一发起拖拽的元素，本体交互不受影响 */
.sb-inline-handle {
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
.sb-inline-handle:active {
  cursor: grabbing;
}
.sb-cell.dragging .sb-inline-handle {
  opacity: 0.5;
}
.sb-cell-placeholder {
  width: 100%;
  min-height: 36px;
  border: 1px dashed #8ec5d8;
  border-radius: 8px;
  color: #3d8a7a;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(228, 240, 235, 0.5);
  box-sizing: border-box;
}
.theme-dark .sb-cell-placeholder {
  border-color: #5a9a8e;
  color: #c5d8e0;
  background: rgba(126, 201, 184, 0.12);
}
.sb-empty {
  padding: 12px;
  text-align: center;
  opacity: 0.6;
  font-size: 13px;
}
.sb-edit-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(126, 201, 184, 0.22);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.75;
  transition: opacity 0.2s, background 0.2s;
  line-height: 1;
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-sizing: border-box;
  flex-shrink: 0;
  overflow: hidden;
  vertical-align: middle;
}
.sb-edit-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  line-height: 1;
  font-size: inherit;
  /* 部分系统字体图标基线偏下，轻微上移以视觉居中 */
  transform: translateY(-0.5px);
}
.sb-edit-btn:hover,
.sb-edit-btn.active {
  opacity: 1;
}
.sb-edit-btn.active {
  background: var(--sb-accent, #7ec9b8);
  color: #fff;
}
.theme-dark .sb-edit-btn.active {
  color: #0f1a18;
}
</style>
