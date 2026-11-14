<template>
  <div class="w-stack" :class="{ 'has-tabs': showTabs, 'layout-on': layoutOn }">
    <div v-if="widget.label" class="w-stack-title" :style="titleStyle">{{ widget.label }}</div>
    <!-- 叠放组容器名条：布局态显示，标明这是叠放组 -->
    <div v-if="layoutOn" class="ws-container-tag">叠放组 · {{ pages.length }} 页</div>
    <div v-if="showTabs" class="w-stack-header" :style="headerStyle">
      <div class="w-stack-tabs" role="tablist" :ref="applyTrackEl">
        <button
          v-for="(name, pi) in pageLabels"
          :key="pi"
          type="button"
          role="tab"
          class="w-stack-tab"
          :class="{ active: pi === index, 'is-drag-over': layoutOn && dragOverPi === pi }"
          :draggable="layoutOn ? 'true' : false"
          :aria-selected="pi === index"
          :title="name"
          :ref="el => applyTabEl(el, pi === index)"
          @click="setIndex(pi)"
          @dragstart="layoutOn ? onTabDragStart($event, pi) : undefined"
          @dragover="layoutOn ? onTabDragOver($event, pi) : undefined"
          @dragleave="layoutOn ? onTabDragLeave(pi) : undefined"
          @drop="layoutOn ? onTabDrop(pi) : undefined"
          @dragend="layoutOn ? onTabDragEnd() : undefined"
        >{{ name }}</button>
      </div>
    </div>
    <div class="w-stack-body" :class="{ 'ws-draggable': layoutOn }">
      <!-- 布局态：给当前页身体叠一个 ⠿ 手柄，按住可把本页拖出到顶层 / 并入其它组 -->
      <span
        v-if="layoutOn && activePage"
        class="ws-handle"
        title="按住拖动可把本页拖出叠放组，到顶层或并入其它分组"
        @pointerdown.stop="onPageHandlePointerDown($event)"
      >⠿</span>
      <WidgetRenderer
        v-if="activePage"
        :key="activePage.id"
        :widget="activePage"
        :hide-title="hideChildTitle"
      />
      <div v-else class="w-stack-empty">{{ layoutOn ? '(空叠放组，从编辑器或别处拖入控件)' : '(空叠放组，在编辑器中添加子页)' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Widget, withOpacity, Binding } from '../schema';
import { useConfigStore } from '../store';
import { resolveStyle, labelCss } from '../lib/style';
import { normalizeGroupRows } from '../lib/layout';
import { getDbRowCount, getDbRowCell } from '../lib/datasource';
import { layoutMode, applyLayoutDrop } from '../lib/layoutMode';
import { bindPointerDrag, type DragPayload } from '../lib/pointerDrag';
import { widgetTypedName } from '../lib/widgetName';
import WidgetRenderer from './WidgetRenderer.vue';

const props = defineProps<{ widget: Widget }>();
const store = useConfigStore();
const style = computed(() => resolveStyle(store.config.layout, props.widget));

/* ------------------------ 在位可视化布局（就地拖拽） ------------------------ */
/** 全局开关：与顶层 App / WidgetGroup 共享同一 ref */
const layoutOn = computed(() => layoutMode.value);

/** 当前叠放组所在顶层行/列（拖出去落点解算用 top-cell/top-end） */
const dragOverPi = ref<number | null>(null);
const tabReorderFrom = ref<number | null>(null);

/**
 * 当前页 ⠿ 手柄 pointerdown：把当前显示的非分组页拖出叠放组。
 * payload kind=stack-page，落点解算复用 applyLayoutDrop（顶层路由）。
 * activePage 在下方声明，函数体运行时才求值，故 TDZ 无碍。
 */
function onPageHandlePointerDown(e: PointerEvent) {
  if (!layoutOn.value) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button, select, input, a')) return;
  const page = activePage.value;
  if (!page) return;
  const pi = Number(props.widget.activePageIndex) || 0;
  const payload: DragPayload = {
    kind: 'stack-page',
    groupId: props.widget.id,
    pageIndex: pi,
    widgetId: page.id,
  };
  const label = widgetTypedName(page, store.config.widgets);
  bindPointerDrag(e, payload, label, (p, target) => {
    applyLayoutDrop(store, p, target);
  });
}

/** 页签拖拽换序（HTML5 drag；仅布局态启用，不影响预阅览点击切页） */
function onTabDragStart(e: DragEvent, pi: number) {
  if (!layoutOn.value) return;
  tabReorderFrom.value = pi;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(pi)); } catch { /* ignore */ }
  }
}
function onTabDragOver(e: DragEvent, pi: number) {
  if (tabReorderFrom.value == null) return;
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  if (e.preventDefault) e.preventDefault();
  dragOverPi.value = pi;
}
function onTabDragLeave(pi: number) {
  if (dragOverPi.value === pi) dragOverPi.value = null;
}
function onTabDrop(pi: number) {
  const from = tabReorderFrom.value;
  dragOverPi.value = null;
  tabReorderFrom.value = null;
  if (from == null || from === pi) return;
  store.moveStackPage(props.widget.id, from, pi);
}
function onTabDragEnd() {
  dragOverPi.value = null;
  tabReorderFrom.value = null;
}

/** 缓存页签/轨道节点，样式变更时重新 setProperty(!important) */
const tabEls = new Map<HTMLElement, boolean>();
let trackEl: HTMLElement | null = null;

/** 真实子页（非自动行模式） */
const realPages = computed<Widget[]>(() =>
  (props.widget.children || [])
    .map(id => store.config.widgets.find(w => w.id === id))
    .filter((w): w is Widget => !!w),
);

/** 自动行模式：首页模板（children[0]） */
const autoTemplate = computed<Widget | null>(() => {
  if (!props.widget.dbAutoRows) return null;
  const id = props.widget.children?.[0];
  if (!id) return null;
  return store.config.widgets.find(w => w.id === id) ?? null;
});

/** 把一个 binding 的 db_row 改为指定行号（保留 latest/object 等非数字语义失效时仍可回退） */
function withRow(b: Binding, row: number): Binding {
  return { ...b, db_row: row };
}

/** 递归在 group 子树中找第一个 source==='db' 且绑定了表名的控件，返回其表名。
 *  与 cloneWithRow 的递归范围一致，支持首页模板为 group 且其子控件再嵌 group。 */
function findFirstDbTable(tpl: Widget, lookup: Map<string, Widget>): string {
  if (tpl.source === 'db' && tpl.binding?.db_table) return tpl.binding.db_table;
  if (tpl.type === 'group') {
    const normRows = normalizeGroupRows(tpl);
    for (const r of normRows) {
      for (const id of r.widgetIds) {
        const child = lookup.get(id);
        if (!child) continue;
        const t = findFirstDbTable(child, lookup);
        if (t) return t;
      }
    }
  }
  return '';
}

/** 递归克隆控件及其 group 子树，把所有 db 源控件的 db_row 改为指定行号。
 *  产生的所有克隆页（含子树）push 进 sink，供渲染期临时表统一挂载。 */
function cloneWithRow(w: Widget, row: number, sink: Widget[]): Widget {
  const next: Widget = { ...w };
  if (w.source === 'db') next.binding = withRow(w.binding, row);
  next.id = `${w.id}__ar${row}`;
  if (w.type === 'group') {
    // 用规范化后的 rows（含孤儿固化），避免模板 group 未排版时子树不被克隆
    const normRows = normalizeGroupRows(w);
    const lookup = new Map(store.config.widgets.map(cw => [cw.id, cw]));
    const nextRows = normRows.map(r => {
      const ids = r.widgetIds
        .map(id => {
          const child = lookup.get(id);
          if (!child) return null;
          const clone = cloneWithRow(child, row, sink);
          sink.push(clone);
          return clone.id;
        })
        .filter((x): x is string => !!x);
      return { ...r, widgetIds: ids };
    });
    next.rows = nextRows;
    next.children = nextRows.flatMap(r => r.widgetIds);
  }
  return next;
}

/** 解析 dbRowFilter 字符串为行号集合：支持逗号/顿号/空格分隔与区间 "5-7"（含两端）。
 *  仅返回正整数、去重并升序。不在此做 [1,n] 夹取——交由调用方按实际行数裁剪。 */
function parseRowFilter(filter: string): number[] {
  const s = (filter || '').trim();
  if (!s) return [];
  const out = new Set<number>();
  for (const part of s.split(/[,，、\s]+/)) {
    const t = part.trim();
    if (!t) continue;
    const range = t.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      for (let r = a; r <= b; r++) if (r >= 1) out.add(r);
    } else {
      const r = Number(t);
      if (Number.isFinite(r) && r >= 1) out.add(Math.floor(r));
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** 自动行模式模板首页实际绑定的数据库表名（缓存，供 autoRowNumbers / pageTabLabel 共用） */
const autoDbTable = computed<string>(() => {
  const tpl = autoTemplate.value;
  if (!tpl) return '';
  return findFirstDbTable(tpl, new Map(store.config.widgets.map(cw => [cw.id, cw])));
});

/** 自动行模式下要克隆的数据行号列表（1 起，裁到 [1,n]，去重升序）：
 *  - dbRowFilter 留空 → 1..n 全量
 *  - 非空 → 只用解析出的且落在表内范围的行号 */
const autoRowNumbers = computed<number[]>(() => {
  const table = autoDbTable.value;
  if (!table) return [];
  const n = getDbRowCount(table);
  if (n <= 0) return [];
  const filter = (props.widget.dbRowFilter || '').trim();
  if (!filter) {
    const all: number[] = [];
    for (let r = 1; r <= n; r++) all.push(r);
    return all;
  }
  return parseRowFilter(filter).filter(r => r >= 1 && r <= n);
});

/** 自动行模式下的虚拟页列表（克隆首页模板，每页换 row）：
 *  autoFlatWidgets 计算完整克隆子树（含顶层组页），autoPages 只取其中顶层组页 */
const autoFlatWidgets = computed<Widget[]>(() => {
  const tpl = autoTemplate.value;
  void store.dataTick;
  if (!tpl) return [];
  const rows = autoRowNumbers.value;
  if (!rows.length) return [];
  const flat: Widget[] = [];
  for (const r of rows) {
    const page = cloneWithRow(tpl, r, flat);
    flat.push(page);
  }
  return flat;
});

/** 自动行模式下顶层页 = flat 里 id 以 templateId 加后缀、形如 `<tid>__ar<N>` 且无父的页。
 *  这里 cloneWithRow 先子后父 push，所以顶层 group 是最后一批以 `__ar${r}` 结尾、
 *  其 id == `${tpl.id}__ar${r}` 的页。直接按模板 id 前缀过滤更稳。 */
const autoPages = computed<Widget[]>(() => {
  const tpl = autoTemplate.value;
  if (!tpl) return [];
  const prefix = `${tpl.id}__ar`;
  return autoFlatWidgets.value.filter(w => w.id.startsWith(prefix));
});

// 监听 flat 变化，更新渲染期临时表（产生副效应放在 watch，不在 computed 内）
watch(autoFlatWidgets, v => { store.setRenderWidgets(v); }, { immediate: true });

const pages = computed<Widget[]>(() => (props.widget.dbAutoRows ? autoPages.value : realPages.value));

const index = computed(() => {
  const n = pages.value.length;
  if (n === 0) return 0;
  let i = Number(props.widget.activePageIndex) || 0;
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  return i;
});

const activePage = computed<Widget | null>(() => pages.value[index.value] || null);

function setIndex(i: number) {
  const n = pages.value.length;
  if (n <= 0) return;
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  store.updateWidget(props.widget.id, { activePageIndex: i });
}

const showTabs = computed(() => pages.value.length > 1 && style.value.stackShowTabs !== false);

/** 默认 tab：页签显示子页名，内容区隐藏标题 */
function pageTabLabel(page: Widget, pi: number): string {
  // 自动行模式：页签显示标签列该页对应原始数据行的值（不带列名）
  if (props.widget.dbAutoRows) {
    const col = props.widget.dbTabColumn || '';
    // 该页对应的原始数据行号（dbRowFilter 筛选时 pi 不再等于行号-1）
    const row = autoRowNumbers.value[pi] ?? pi + 1;
    const tableCode = autoDbTable.value;
    if (col && tableCode) {
      const v = getDbRowCell(tableCode, row, col);
      if (v !== undefined && v !== null && String(v) !== '') return String(v);
    }
    return String(pi + 1);
  }
  const mode = (style.value.stackTabLabelMode || 'tab') as string;
  const pageName = (page.label || '').trim();
  if (mode === 'page') return String(pi + 1);
  return pageName || `页${pi + 1}`;
}

const pageLabels = computed(() => pages.value.map((w, i) => pageTabLabel(w, i)));

const hideChildTitle = computed(() => {
  if (!showTabs.value) return false;
  return (style.value.stackTabLabelMode || 'tab') === 'tab';
});

const titleStyle = computed(() => {
  const s = style.value;
  const out: Record<string, string | undefined> = { ...labelCss(s) };
  if (!out.color) {
    out.color = withOpacity(s.color || '#e4eef2', s.colorOpacity ?? 1);
  }
  if (s.bg && s.bg !== 'transparent') {
    out.background = withOpacity(s.bg, s.bgOpacity ?? 1);
    out.borderRadius = (s.radius ?? 6) + 'px';
    out.padding = '2px 6px';
  }
  return out;
});

const accent = computed(() => {
  const custom = (style.value.stackAccent || '').trim();
  if (custom) return custom;
  return (store.config.layout.accentColor || '').trim() || '#7ec9b8';
});

const metrics = computed(() => {
  const s = style.value;
  const fs = Math.max(8, Math.min(20, Number(s.stackFontSize) || 11));
  // stackGap = 页签之间水平间距
  const tabGap = Math.max(0, Math.min(16, Number.isFinite(Number(s.stackGap)) ? Number(s.stackGap) : 4));
  // stackTabPadY = 页签栏上下外边距（不撑开页签背景）
  const outerY = Math.max(0, Math.min(16, Number(s.stackTabPadY) || 0));
  // 页签本体固定内边距，与字号联动
  const padY = Math.max(2, Math.round(fs * 0.2));
  const padX = Math.max(6, Math.round(fs * 0.7));
  const rawR = Number(s.stackTabRadius);
  const radius = Math.max(0, Math.min(24, Number.isFinite(rawR) ? rawR : 12));
  return { fs, tabGap, outerY, padY, padX, radius };
});

/** 上下边距：加在整行 header 外边距，不撑开页签/组底色；与内容区另留 4px */
const headerStyle = computed(() => {
  const y = metrics.value.outerY;
  return {
    marginTop: y + 'px',
    marginBottom: y + 4 + 'px',
  } as Record<string, string>;
});

/**
 * 组底色：只包住页签内容宽度（shrink-to-fit），不占满整行。
 * 默认强调色浅底；transparent / 自定义色可覆盖。
 */
const trackStyle = computed(() => {
  const s = style.value;
  const trackRaw = (s.stackTabTrack || '').trim();
  let bg: string;
  if (trackRaw === 'transparent') bg = 'transparent';
  else if (trackRaw) bg = trackRaw;
  else bg = withOpacity(accent.value, 0.14);
  return {
    background: bg,
    backgroundColor: bg,
    borderRadius: metrics.value.radius + 'px',
    padding: '2px',
    gap: metrics.value.tabGap + 'px',
  } as Record<string, string>;
});

function tabColors(active: boolean): { bg: string; color: string; opacity: string } {
  const s = style.value;
  const inactiveBg = (s.stackTabInactiveBg || '').trim();
  const inactiveColor = (s.stackTabColor || '').trim();
  let bg = inactiveBg || 'transparent';
  let color = inactiveColor || 'inherit';
  let opacity = inactiveBg || inactiveColor ? '1' : '0.55';
  if (active) {
    const abg = (s.stackTabActiveBg || '').trim();
    bg = abg || withOpacity(accent.value, 0.24);
    color = (s.stackTabActiveColor || '').trim() || accent.value;
    opacity = '1';
  }
  return { bg, color, opacity };
}

/**
 * 宿主酒馆对 button 常有默认底色且带 !important；
 * Vue :style 无法写 !important，必须 setProperty(..., 'important')。
 */
function paintTab(node: HTMLElement, active: boolean) {
  const m = metrics.value;
  const { bg, color, opacity } = tabColors(active);
  const set = (prop: string, val: string) => node.style.setProperty(prop, val, 'important');
  set('font-size', m.fs + 'px');
  set('padding', `${m.padY}px ${m.padX}px`);
  set('border-radius', m.radius + 'px');
  set('border', 'none');
  set('outline', 'none');
  set('box-shadow', 'none');
  set('margin', '0');
  set('background', bg);
  set('background-color', bg);
  set('background-image', 'none');
  set('color', color);
  set('opacity', opacity);
  set('-webkit-appearance', 'none');
  set('appearance', 'none');
  set('cursor', 'pointer');
  set('font-weight', '500');
  set('line-height', '1.2');
  set('max-width', '10em');
  set('overflow', 'hidden');
  set('text-overflow', 'ellipsis');
  set('white-space', 'nowrap');
  set('flex', '0 0 auto');
  set('box-sizing', 'border-box');
}

function paintTrack(node: HTMLElement) {
  const st = trackStyle.value;
  const set = (prop: string, val: string) => node.style.setProperty(prop, val, 'important');
  set('background', st.background);
  set('background-color', st.backgroundColor);
  set('border-radius', st.borderRadius);
  set('padding', st.padding);
  set('display', 'inline-flex');
  set('flex-flow', 'row nowrap');
  set('align-items', 'center');
  set('justify-content', 'flex-start');
  set('gap', st.gap);
  set('width', 'auto');
  set('max-width', '100%');
  set('min-width', '0');
  set('flex', '0 1 auto');
  set('overflow-x', 'auto');
  set('overflow-y', 'hidden');
  set('box-sizing', 'border-box');
}

function applyTabEl(el: unknown, active: boolean) {
  const node = el as HTMLElement | null;
  if (!node || !(node instanceof HTMLElement)) return;
  tabEls.set(node, active);
  paintTab(node, active);
}

function applyTrackEl(el: unknown) {
  const node = el as HTMLElement | null;
  if (!node || !(node instanceof HTMLElement)) {
    trackEl = null;
    return;
  }
  trackEl = node;
  paintTrack(node);
}

function repaintAll() {
  if (trackEl) paintTrack(trackEl);
  // active 以当前 index 为准重算
  const labels = pageLabels.value;
  let i = 0;
  for (const node of tabEls.keys()) {
    if (!node.isConnected) {
      tabEls.delete(node);
      continue;
    }
    const active = i === index.value;
    tabEls.set(node, active);
    paintTab(node, active);
    i++;
  }
  // 若 Map 与 DOM 数量不一致（v-for 重建），按 DOM 重扫
  if (trackEl && i !== labels.length) {
    tabEls.clear();
    Array.from(trackEl.querySelectorAll('.w-stack-tab')).forEach((node, pi) => {
      if (node instanceof HTMLElement) {
        tabEls.set(node, pi === index.value);
        paintTab(node, pi === index.value);
      }
    });
  }
}

watch(
  () => [
    style.value.stackGap,
    style.value.stackFontSize,
    style.value.stackTabPadY,
    style.value.stackTabRadius,
    style.value.stackTabTrack,
    style.value.stackTabColor,
    style.value.stackTabInactiveBg,
    style.value.stackTabActiveColor,
    style.value.stackTabActiveBg,
    style.value.stackAccent,
    style.value.stackTabLabelMode,
    index.value,
    accent.value,
    pages.value.map(p => p.label).join('|'),
  ],
  () => {
    nextTick(() => repaintAll());
  },
);
</script>

<style scoped>
/* 布局兜底：颜色/间距优先走内联，避免 teleportStyle 漏传异步 chunk 样式 */
.w-stack {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  gap: 0;
}
/* ---------- 布局态：叠放组容器名条 + 当前页手柄 ---------- */
.w-stack.layout-on {
  position: relative;
  outline: 1px dashed rgba(126, 201, 184, 0.55);
  outline-offset: 2px;
  border-radius: 10px;
  padding: 2px;
  background: rgba(126, 201, 184, 0.05);
}
.theme-dark .w-stack.layout-on {
  outline-color: rgba(142, 197, 216, 0.55);
}
.ws-container-tag {
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
.theme-light .ws-container-tag {
  background: rgba(255, 255, 255, 0.85);
  color: #2f6f66;
  border-color: rgba(95, 173, 156, 0.5);
}
/* 当前页 ⠿ 手柄：左上角圆角小钮，拖出本页 */
.ws-handle {
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
  background: rgba(126, 201, 184, 0.9);
  border-radius: 8px 0 8px 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.ws-handle:active {
  cursor: grabbing;
}
.w-stack-body.ws-draggable {
  position: relative;
  outline: 1px dashed rgba(126, 201, 184, 0.45);
  outline-offset: 2px;
  border-radius: 8px;
  padding: 2px;
}
/* 页签布局态：高亮 drop 目标 */
.w-stack-tab.is-drag-over {
  outline: 2px dashed var(--sb-accent, #7ec9b8);
  outline-offset: -2px;
}
.w-stack-tab[draggable='true'] {
  cursor: grab;
}
.w-stack-tab[draggable='true']:active {
  cursor: grabbing;
}
.w-stack-title {
  line-height: 1.3;
  opacity: 0.9;
  margin-bottom: 4px;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-stack-header {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  user-select: none;
}
.w-stack-tabs {
  display: inline-flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 4px;
  width: auto;
  max-width: 100%;
  min-width: 0;
  flex: 0 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  box-sizing: border-box;
}
.w-stack-tabs::-webkit-scrollbar {
  display: none;
}
.w-stack-tab {
  -webkit-appearance: none !important;
  appearance: none !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  margin: 0 !important;
  background-image: none !important;
  flex: 0 0 auto !important;
}
.w-stack-tab:focus,
.w-stack-tab:active {
  outline: none !important;
  box-shadow: none !important;
}
.w-stack-body {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.w-stack-body > :deep(*) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.w-stack-body > :deep(.w-renderer:has(.w-image.is-stretch)),
.w-stack-body > :deep(.w-image.is-stretch) {
  flex: 1 1 auto;
  min-height: 64px;
  align-self: stretch;
}
.w-stack-empty {
  opacity: 0.55;
  font-size: 0.9em;
  padding: 4px 0;
}
</style>
