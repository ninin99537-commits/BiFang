<template>
  <div ref="rowEl" class="smart-equal-row" :class="rowClass" :style="baseStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { RowAlign } from '../schema';
import { rowAlignToJustify } from '../lib/layout';
import {
  applyColWidths,
  clearColWidths,
  computeSmartEqualWidths,
  measureNaturalWidths,
  measureTitleWidths,
} from '../lib/smartCols';

const props = withDefaults(
  defineProps<{
    gap?: number;
    enabled?: boolean;
    deps?: unknown;
    /** 行内分布：equal 等分满行 | start/center/end/between/around */
    rowAlign?: RowAlign | string;
    /** 智能平分：空间够完整显示；不够则尽量多显示 */
    smartEqual?: boolean;
    rowClass?: string | Record<string, boolean> | (string | Record<string, boolean>)[];
    extraStyle?: Record<string, string | number | undefined>;
    cellSelector?: string;
  }>(),
  {
    gap: 0,
    enabled: true,
    rowAlign: 'between',
    smartEqual: true,
    cellSelector: '',
  },
);

const rowEl = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;
let mo: MutationObserver | null = null;
let raf = 0;
let relayouting = false;

const baseStyle = computed(() => {
  const extra = props.extraStyle || {};
  if (!props.enabled) return { ...extra };
  return {
    display: 'flex',
    flexDirection: 'row' as const,
    flexWrap: 'nowrap' as const,
    alignItems: 'stretch',
    justifyContent: rowAlignToJustify(props.rowAlign),
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box' as const,
    gap: `${Math.max(0, props.gap)}px`,
    ['--sb-row-align' as string]: String(props.rowAlign || 'between'),
    ['--sb-smart-equal' as string]: props.smartEqual ? '1' : '0',
    ...extra,
  };
});

function cells(): HTMLElement[] {
  const row = rowEl.value;
  if (!row) return [];
  let list: HTMLElement[];
  if (props.cellSelector) {
    list = Array.from(row.querySelectorAll(`:scope > ${props.cellSelector}`)) as HTMLElement[];
  } else {
    list = Array.from(row.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
  }
  return list.filter(
    el =>
      !el.classList.contains('sb-cell-placeholder') &&
      !el.classList.contains('sb-row-meta') &&
      !el.classList.contains('sb-row-collapsed-tip'),
  );
}

function relayout() {
  const row = rowEl.value;
  if (!row) return;
  const list = cells();
  if (!props.enabled || list.length <= 1) {
    clearColWidths(list);
    return;
  }
  relayouting = true;
  try {
    // 与同行等高图片按固有比例估宽：用它当前行高作目标高度。
    // 用 cells 各自 clientHeight 的最大值更贴合实际（含数据变化后的高度），
    // 兜底用 row 的 clientHeight。
    let rowH = 0;
    for (const c of list) rowH = Math.max(rowH, c.getBoundingClientRect().height);
    if (rowH < 1) rowH = row.clientHeight || 0;
    let hasStretchImg = false;
    for (const c of list) {
      if (c.querySelector('.w-image.is-stretch')) { hasStretchImg = true; break; }
    }
    const natural = measureNaturalWidths(list, hasStretchImg ? rowH : 0);
    const titles = measureTitleWidths(list);
    const cw = row.clientWidth || row.getBoundingClientRect().width;
    const align = props.rowAlign || 'between';
    const gap = Math.max(0, props.gap);
    const smart = props.smartEqual !== false;
    const widths = computeSmartEqualWidths(cw, natural, gap, align, titles, smart);
    const floors = widths.map((w, i) => {
      const t = titles[i] || 0;
      const soft = t > 0 ? t + 48 : 40;
      return Math.max(0, Math.min(w, soft, natural[i] || soft));
    });
    // equal 满行：列宽已 pad；其它分布：内容宽 + justify
    applyColWidths(list, widths, align !== 'equal', floors);
  } finally {
    requestAnimationFrame(() => {
      relayouting = false;
    });
  }
}

function schedule() {
  if (relayouting) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    nextTick(() => {
      requestAnimationFrame(() => relayout());
    });
  });
}

onMounted(() => {
  const row = rowEl.value;
  if (row) {
    ro = new ResizeObserver(() => schedule());
    ro.observe(row);
    mo = new MutationObserver(muts => {
      if (relayouting) return;
      for (const m of muts) {
        if (m.type === 'characterData' || m.type === 'childList') {
          schedule();
          return;
        }
      }
    });
    mo.observe(row, { childList: true, subtree: true, characterData: true });
    // 图片加载完成后自然宽变化（与同行等高图片按固有比例重算列宽）
    row.addEventListener('load', onLoadEvent, true);
  }
  schedule();
  window.setTimeout(() => schedule(), 80);
  window.setTimeout(() => schedule(), 320);
});

function onLoadEvent(e: Event) {
  const t = e.target as HTMLElement | null;
  if (t && t.tagName === 'IMG') schedule();
}

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
  mo?.disconnect();
  const row = rowEl.value;
  if (row) row.removeEventListener('load', onLoadEvent, true);
  clearColWidths(cells());
});

watch(
  () =>
    [props.gap, props.enabled, props.deps, props.cellSelector, props.rowAlign, props.smartEqual] as const,
  () => schedule(),
  { flush: 'post' },
);

defineExpose({ relayout: schedule });
</script>

<style scoped>
.smart-equal-row {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.smart-equal-row > :deep(*) {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.smart-equal-row > :deep(.is-divider) {
  min-width: 8px;
}
.smart-equal-row > :deep(*) > * {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
</style>
