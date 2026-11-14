<template>
  <div class="w-divider" :class="{ plain: !widget.label }" :style="styleObj">
    <span v-if="widget.label" class="w-divider-text">{{ widget.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Widget } from '../schema';
import { useConfigStore } from '../store';
import { resolveStyle, withOpacity } from '../lib/style';

const props = defineProps<{ widget: Widget }>();
const store = useConfigStore();
const styleObj = computed(() => {
  const s = resolveStyle(store.config.layout, props.widget);
  const color = withOpacity(s.color || '#333333', s.colorOpacity ?? 1);
  // 上下间距用「内边距」控制；无标题时不写 fontSize，避免行高把 1px 线撑高
  const v = Math.max(0, s.padding ?? 0);
  const hasLabel = !!(props.widget.label && props.widget.label.trim());
  return {
    color,
    fontFamily: s.font,
    fontSize: hasLabel ? s.fontSize + 'px' : '0',
    lineHeight: hasLabel ? '1' : '0',
    textAlign: s.align,
    width: '100%',
    boxSizing: 'border-box',
    margin: '0',
    paddingTop: v + 'px',
    paddingBottom: v + 'px',
    height: hasLabel ? undefined : `${Math.max(1, v * 2 + 1)}px`,
  } as Record<string, string | undefined>;
});
</script>

<style scoped>
.w-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 0;
  line-height: 1;
  overflow: hidden;
}
/* 无标题：完整直线（用单边线，避免 ::before/::after 各占一半导致中间缝） */
.w-divider.plain {
  gap: 0;
  min-height: 1px;
  height: 1px;
  font-size: 0;
  line-height: 0;
}
.w-divider.plain::before {
  content: '';
  flex: 1;
  height: 1px;
  background: currentColor;
  opacity: 0.4;
  width: 100%;
}
.w-divider.plain::after {
  display: none;
  content: none;
}
.w-divider:not(.plain)::before,
.w-divider:not(.plain)::after {
  content: '';
  flex: 1;
  height: 1px;
  background: currentColor;
  opacity: 0.4;
}
.w-divider-text {
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
