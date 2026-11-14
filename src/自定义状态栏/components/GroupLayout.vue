<template>
  <div class="sg-grid" :style="bodyStyle">
    <div
      v-for="(rowBlock, ri) in rowBlocks"
      :key="rowBlock.row.id"
      class="sg-row"
      :class="{ 'is-empty-row': rowBlock.widgets.length === 0, 'is-collapsed': rowBlock.row.collapsed }"
      :style="rowOuterStyle(rowBlock.row, rowBlock.widgets.length)"
      :data-sb-drop="JSON.stringify({ kind: 'group-end', groupId, row: ri })"
    >
      <div class="sg-row-meta">
        <button
          type="button"
          class="sg-row-fold"
          :title="rowBlock.row.collapsed ? '展开本行' : '折叠本行'"
          @click="store.toggleChildRowCollapsed(groupId, ri)"
        >
          {{ rowBlock.row.collapsed ? '▸' : '▾' }}
        </button>
        <span>第 {{ ri + 1 }} 行</span>
        <button class="sg-row-ord" title="上移" :disabled="ri === 0" @click="store.reorderChildRow(groupId, ri, ri - 1)">↑</button>
        <button class="sg-row-ord" title="下移" :disabled="ri === rowBlocks.length - 1" @click="store.reorderChildRow(groupId, ri, ri + 1)">↓</button>
        <button class="sg-row-del" title="删除行" @click="store.removeChildRow(groupId, ri)">✕</button>
        <span class="sg-row-cols-hint">{{ Math.max(rowBlock.widgets.length, 1) }} 列</span>
      </div>
      <div v-if="!rowBlock.row.collapsed && rowBlock.widgets.length > 1" class="sg-row-align">
        <span>分布</span>
        <select
          :value="rowBlock.row.rowAlign === 'equal' ? 'equal' : (rowBlock.row.rowAlign || 'between')"
          @change="store.updateChildRowMeta(groupId, ri, { rowAlign: ($event.target as HTMLSelectElement).value as any })"
        >
          <option value="equal">等分满行</option>
          <option value="start">靠左</option>
          <option value="center">居中</option>
          <option value="end">靠右</option>
          <option value="between">两端</option>
          <option value="around">均分空隙</option>
        </select>
        <label class="sg-smart-eq" title="空间够时完整显示；不够则尽量多显示被缩略内容">
          <input
            type="checkbox"
            :checked="rowBlock.row.smartEqual !== false"
            @change="store.updateChildRowMeta(groupId, ri, { smartEqual: ($event.target as HTMLInputElement).checked })"
          />
          智能平分
        </label>
      </div>
      <template v-if="!rowBlock.row.collapsed">
        <div
          v-for="(w, ci) in rowBlock.widgets"
          :key="w.id"
          class="sg-cell"
          :class="{ 'sg-cell-group': w.type === 'group' }"
          :data-sb-drop="JSON.stringify({ kind: 'group-cell', groupId, row: ri, cell: ci })"
          @pointerdown="onPointerDown(ri, ci, w, $event)"
        >
          <div class="sg-drag-handle">⠿</div>
          <div class="sg-cell-label">{{ widgetTypedName(w, store.config.widgets) }}</div>
          <button type="button" class="sg-out" title="移出分组" @click.stop="store.removeChildFromGroup(groupId, w.id)">↗</button>
          <!-- 嵌套分组：就地展开，可视化布局可继续编辑其子控件 -->
          <GroupLayout
            v-if="w.type === 'group'"
            class="sg-nested"
            :group="w"
            @child-drag-out="onNestedDragOut"
            @child-drag-end="emit('child-drag-end')"
          />
        </div>
        <div
          v-if="rowBlock.widgets.length < 6"
          class="sg-cell-placeholder"
          :data-sb-drop="JSON.stringify({ kind: 'group-end', groupId, row: ri })"
        >
          {{ rowBlock.widgets.length === 0 ? '拖到这里' : '+ 并入' }}
        </div>
      </template>
      <div v-else class="sg-row-collapsed-tip">已折叠 · {{ rowBlock.widgets.length }} 个</div>
    </div>
    <div class="sg-toolbar">
      <button class="sg-add-row" @click="store.addChildRow(groupId, 1)">+ 空行</button>
      <button class="sg-add-row" title="复制本分组的行结构/分布/折叠" @click="store.copyGroupLayout(groupId)">复制布局</button>
      <button
        class="sg-add-row"
        title="把已复制的行结构套到本分组（按子控件顺序切分）"
        :disabled="!store.groupLayoutClipboard"
        @click="store.pasteGroupLayout(groupId)"
      >粘贴布局</button>
      <span class="sg-hint">拖出到行外 / 点 ↗ 移出 · 可复制粘贴行布局</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { Widget, LayoutRow } from '../schema';
import { useConfigStore } from '../store';
import { normalizeGroupRows } from '../lib/layout';
import {
  bindPointerDrag,
  forceStopAllDrag,
  type DragPayload,
  type DropTarget,
} from '../lib/pointerDrag';
import { widgetTypedName } from '../lib/widgetName';

/** 自引用递归：拆 chunk 避免 GridLayout ↔ 自身 循环依赖 */
const GridLayout = defineAsyncComponent(() => import('./GroupLayout.vue'));

const props = defineProps<{ group: Widget }>();
const emit = defineEmits<{
  (e: 'child-drag-out', info: { groupId: string; row: number; cell: number; widgetId: string }): void;
  (e: 'child-drag-end'): void;
}>();

const store = useConfigStore();
const groupId = computed(() => props.group.id);
/** 非响应式：拖拽中勿触发 Vue 重渲 */
let dragFrom: { row: number; cell: number } | null = null;
let dragEl: HTMLElement | null = null;

function markDrag(el: EventTarget | null, on: boolean) {
  const node = (el as HTMLElement | null)?.closest?.('.sg-cell') as HTMLElement | null;
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

function rowOuterStyle(_row: LayoutRow, _widgetCount: number): Record<string, string> {
  // 可视化布局：列纵向堆叠，避免多列挤成一行看不清标签
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
    width: '100%',
    minWidth: '0',
    boxSizing: 'border-box',
  };
}

const rowBlocks = computed(() => {
  // 优先读 store 里最新 group（含刚 reorder 写回的 rows），避免 props 快照与 store 脱节
  const live = store.config.widgets.find(w => w.id === props.group.id) || props.group;
  const rows = normalizeGroupRows(live);
  return rows.map(row => ({
    row,
    widgets: row.widgetIds
      .map(id => store.config.widgets.find(w => w.id === id))
      .filter((w): w is Widget => !!w),
  }));
});

/** 仅用于可视化布局：固定行距，不跟全局 layout.gap */
const bodyStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
}));

function childPayload(row: number, cell: number, w: Widget): DragPayload {
  return { kind: 'child', groupId: groupId.value, row, cell, widgetId: w.id };
}

function applyInternalOrOut(payload: DragPayload, target: DropTarget) {
  if (payload.kind !== 'child' || payload.groupId !== groupId.value) {
    // 顶层拖入本 group
    if (payload.kind === 'top' && (target.kind === 'group-cell' || target.kind === 'group-end' || target.kind === 'into-group')) {
      store.dropTopWidgetIntoGroup(groupId.value, payload.row, payload.cell);
    }
    return;
  }
  if (target.kind === 'group-cell' && target.groupId === groupId.value) {
    if (payload.row === target.row && payload.cell === target.cell) return;
    store.moveChildWidgetCell(groupId.value, payload.row, payload.cell, target.row, target.cell);
    return;
  }
  if (target.kind === 'group-end' && target.groupId === groupId.value) {
    store.moveChildWidgetCell(groupId.value, payload.row, payload.cell, target.row, 999);
    return;
  }
  // 拖到顶层
  if (target.kind === 'top-cell') {
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, target.row, target.cell);
    return;
  }
  if (target.kind === 'top-end') {
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, target.row, 999);
    return;
  }
  if (target.kind === 'into-group' && target.groupId !== payload.groupId) {
    store.dropChildToTop(payload.groupId, payload.row, payload.cell, 0, 0);
    const top = store.config.layout.rows;
    for (let r = 0; r < top.length; r++) {
      const c = top[r].widgetIds.indexOf(payload.widgetId);
      if (c >= 0) {
        store.dropTopWidgetIntoGroup(target.groupId, r, c);
        break;
      }
    }
  }
}

function onPointerDown(row: number, cell: number, w: Widget, e: PointerEvent) {
  // 移出按钮不抢拖拽
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button, select, input, a')) return;
  // 嵌套分组内部 cell 的 pointerdown 会冒泡到本 sg-cell：交给内层 GridLayout 处理，
  // 否则外层会覆盖 bindPointerDrag 导致拖动结果错误
  if (t?.closest?.('.sg-nested')) return;
  const payload = childPayload(row, cell, w);
  const label = widgetTypedName(w, store.config.widgets);
  const started = bindPointerDrag(e, payload, label, (p, drop) => {
    applyInternalOrOut(p, drop);
    dragFrom = null;
    markDrag(null, false);
    emit('child-drag-end');
  });
  if (started) {
    dragFrom = { row, cell };
    markDrag(e.currentTarget || e.target, true);
    emit('child-drag-out', { groupId: groupId.value, row, cell, widgetId: w.id });
  }
}

function onDragEnd() {
  dragFrom = null;
  markDrag(null, false);
  forceStopAllDrag();
  emit('child-drag-end');
}

/** 嵌套分组内拖出：转发给父级，由 App 统一处理跨层拖拽 */
function onNestedDragOut(info: { groupId: string; row: number; cell: number; widgetId: string }) {
  emit('child-drag-out', info);
}
</script>

<style scoped>
.sg-grid {
  width: 100%;
}
.sg-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  outline: 1px dashed rgba(126, 201, 184, 0.55);
  outline-offset: 2px;
  border-radius: 8px;
  padding: 6px;
  margin: 2px 0;
  background: rgba(126, 201, 184, 0.1);
  min-height: 44px;
  width: 100%;
  box-sizing: border-box;
}
.sg-row.is-empty-row {
  min-height: 52px;
}
.sg-row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #4b5563;
  margin-bottom: 2px;
  flex-wrap: nowrap;
}
.sg-row-fold {
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
.theme-dark .sg-row-fold {
  background: #2a4a48;
  color: #c8ebe2;
}
.sg-row-align {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 22px;
  opacity: 0.9;
  padding: 0 0 4px;
}
.sg-row-align span {
  display: inline-flex;
  align-items: center;
  line-height: 22px;
}
.sg-row-align select {
  display: inline-flex;
  align-items: center;
  height: 22px;
  box-sizing: border-box;
  padding: 0 4px;
  border: 1px solid rgba(126, 201, 184, 0.45);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  line-height: 20px;
  vertical-align: middle;
}
.sg-smart-eq {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 2px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  font-size: 11px;
  line-height: 22px;
}
.sg-smart-eq input {
  margin: 0;
  cursor: pointer;
  accent-color: #5fad9c;
}
.sg-row-collapsed-tip {
  font-size: 11px;
  opacity: 0.65;
  padding: 2px 0;
}
.sg-row.is-collapsed {
  min-height: 0;
}
.theme-dark .sg-row-meta,
.sb-root.is-chat-mounted.theme-dark .sg-row-meta {
  color: #b8c9c4;
}
.sg-row-cols-hint {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.65;
  white-space: nowrap;
}
.sg-row-ord,
.sg-row-del {
  border: none;
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
  flex-shrink: 0;
}
.sg-row-ord {
  background: #d8efe9;
  color: #2f6f66;
}
.sg-row-del {
  margin-left: auto;
  background: #fee2e2;
  color: #b91c1c;
}
.theme-dark .sg-row-ord {
  background: #2a4a48;
  color: #c8ebe2;
}
.theme-dark .sg-row-del {
  background: #4a2a2a;
  color: #fca5a5;
}
.sg-row-ord:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sg-cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 4px 28px 4px 18px;
  outline: 1px solid rgba(126, 201, 184, 0.45);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.6);
  cursor: grab;
  font-size: 12px;
  user-select: none;
  touch-action: none;
  -webkit-user-drag: none;
  box-sizing: border-box;
}
/* 嵌套分组：纵向布局，sg-cell-label 当标题，下方放嵌套 GridLayout */
.sg-cell.sg-cell-group {
  flex-direction: column;
  align-items: stretch;
  padding: 6px 6px 6px 8px;
  background: rgba(126, 201, 184, 0.08);
}
.sg-nested {
  width: 100%;
  margin-top: 4px;
}
.theme-dark .sg-cell {
  background: rgba(36, 48, 56, 0.7);
  outline-color: rgba(142, 197, 216, 0.5);
}
.sg-cell.dragging {
  opacity: 0.45;
}
.sg-drag-handle {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 11px;
  opacity: 0.55;
  cursor: grab;
}
.sg-cell-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-out {
  position: absolute;
  top: 4px;
  right: 4px;
  border: none;
  background: rgba(126, 201, 184, 0.25);
  color: inherit;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
.sg-cell-placeholder {
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
.theme-dark .sg-cell-placeholder {
  border-color: #5a9a8e;
  color: #c5d8e0;
  background: rgba(126, 201, 184, 0.12);
}
.sg-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
  margin-top: 4px;
  flex-wrap: wrap;
}
.sg-hint {
  font-size: 10px;
  opacity: 0.6;
}
.sg-add-row {
  border: 1px solid #8ec5d8;
  background: #fff;
  color: #3d8a7a;
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 11px;
}
.sg-add-row:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.theme-dark .sg-add-row {
  background: #1f2833;
  border-color: #4a8a80;
  color: #e4eef2;
}
</style>
