<template>
  <div
    class="w-expand"
    :class="[layoutClass, 'align-' + align, 'valign-' + alignV, { 'is-italic': !!styleObj.italic }]"
    :style="expandStyle"
  >
    <span
      v-for="(p, j) in parts"
      :key="j"
      class="w-chip"
      :class="{ plain: isPlain(p) }"
      :style="j > 0 && negMargin ? { ...chipStyle(p), ...negMargin } : chipStyle(p)"
      :title="p"
      >{{ p }}</span
    >
    <span v-if="!parts.length" class="w-expand-empty">—</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetStyle } from '../schema';
import { isShortChip } from '../lib/datasource';
import { chipCss, isChipEnabled } from '../lib/style';

const props = withDefaults(
  defineProps<{
    parts: string[];
    styleObj: WidgetStyle;
    layout?: 'stack' | 'inline';
    align?: 'left' | 'center' | 'right';
    alignV?: 'top' | 'center' | 'bottom';
  }>(),
  {
    layout: 'stack',
    align: 'left',
    alignV: 'center',
  },
);

const layoutClass = computed(() => (props.layout === 'inline' ? 'inline' : 'stack'));
const expandStyle = computed(() => {
  const g = props.styleObj.fieldsGap ?? 6;
  return g >= 0 ? { gap: g + 'px' } : { gap: '0px' };
});
const negMargin = computed(() => {
  const g = props.styleObj.fieldsGap ?? 6;
  if (g >= 0) return null;
  return props.layout === 'inline' ? { marginLeft: g + 'px' } : { marginTop: g + 'px' };
});

function isPlain(p: string) {
  // 按「分割后的片段」长度判断，不按整段原文
  return !isChipEnabled(props.styleObj) || !isShortChip(p);
}
function chipStyle(p: string) {
  return chipCss(props.styleObj, p, isShortChip);
}
</script>

<style scoped>
.w-expand {
  display: flex;
  gap: 4px 6px;
  min-width: 0;
  /* 占满数据区：短文自然宽，长文在格内 ellipsis；basis auto 避免短文被压没 */
  width: 100%;
  max-width: 100%;
  align-items: center;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  flex: 1 1 auto;
}
.w-expand.stack {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-start;
}
/* stack 主轴=纵向，chip 在撑高的数据区内垂直对齐（默认居中，修复加边框后高度不一被顶对齐的问题） */
.w-expand.stack.valign-center {
  justify-content: center;
}
.w-expand.stack.valign-top {
  justify-content: flex-start;
}
.w-expand.stack.valign-bottom {
  justify-content: flex-end;
}
.w-expand.inline {
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
}
.w-expand.align-center {
  justify-content: center;
}
.w-expand.align-center.stack {
  align-items: center;
}
.w-expand.align-right {
  justify-content: flex-end;
}
.w-expand.align-right.stack {
  align-items: flex-end;
}
.w-expand.align-left {
  justify-content: flex-start;
}

.w-chip {
  display: block;
  vertical-align: middle;
  min-width: 0;
  max-width: 100%;
  padding: 2px 9px;
  border: 1px solid transparent;
  border-top-width: 1px;
  border-bottom-width: 1px;
  line-height: 1.2;
  box-sizing: border-box;
  /* 边框随文字宽度，不再撑满整列 */
  width: max-content;
  max-width: 100%;
  flex: 0 1 auto;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: normal;
  overflow-wrap: normal;
}
.w-expand.stack .w-chip,
.w-expand.inline .w-chip {
  flex: 0 1 auto;
  min-width: 0;
  width: max-content;
  max-width: 100%;
}
.w-chip.plain {
  padding: 0;
  border: none;
  background: transparent !important;
  border-radius: 0 !important;
}
/* 斜体字形右侧常超出 metrics；无边框时 padding=0 会被 overflow 裁掉末笔 */
.w-expand.is-italic {
  padding-inline-end: 0.2em;
}
.w-expand.is-italic .w-chip {
  padding-inline-end: max(0.2em, 2px);
}
.w-expand.is-italic .w-chip.plain {
  padding: 0 0.22em 0 0;
}
.w-expand-empty {
  opacity: 0.55;
  line-height: 1.35;
}
</style>
