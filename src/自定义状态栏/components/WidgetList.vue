<template>
  <div class="w-list" :style="wrapStyle">
    <div v-if="widget.label" class="w-list-title" :style="titleStyle">{{ widget.label }}</div>
    <ExpandableParts
      :parts="items"
      :style-obj="style"
      :layout="fieldsClass"
      :align="style.align"
      :align-v="style.alignV"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Widget } from '../schema';
import { formatValue, displayParts, splitDisplayParts } from '../lib/datasource';
import { useConfigStore } from '../store';
import { resolveStyle, baseWidgetCss, labelCss } from '../lib/style';
import ExpandableParts from './ExpandableParts.vue';

const props = defineProps<{ widget: Widget; value?: any }>();
const store = useConfigStore();
const style = computed(() => resolveStyle(store.config.layout, props.widget));
const fieldsClass = computed(() => (style.value.fieldsLayout === 'inline' ? 'inline' : 'stack'));
const items = computed<string[]>(() => {
  void store.dataTick;
  const entries = store.widgetEntries(props.widget);
  if (entries.length > 1) {
    return entries.flatMap(e => {
      const raw = e.name ? `${e.name}: ${formatValue(e.value)}` : formatValue(e.value);
      const parts = splitDisplayParts(raw);
      return parts.length ? parts : raw ? [raw] : [];
    });
  }
  const v = props.value ?? entries[0]?.value;
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object' && 'name' in v[0]) {
      return v.flatMap((x: any) => {
        const raw = `${x.name}: ${formatValue(x.value)}`;
        const parts = splitDisplayParts(raw);
        return parts.length ? parts : [raw];
      });
    }
    return v.flatMap(x => {
      const raw = formatValue(x);
      const parts = splitDisplayParts(raw);
      return parts.length ? parts : raw ? [raw] : [];
    });
  }
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, val]) => {
      const raw = `${k}: ${formatValue(val)}`;
      const parts = splitDisplayParts(raw);
      return parts.length ? parts : [raw];
    });
  }
  if (v === undefined || v === null || v === '') return [];
  return displayParts(v);
});
const wrapStyle = computed(() => ({
  ...baseWidgetCss(style.value),
  display: 'flex',
}) as Record<string, string | undefined>);
const titleStyle = computed(() => labelCss(style.value));
</script>

<style scoped>
.w-list {
  word-break: break-word;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  gap: 4px 8px;
  overflow: hidden;
}
.w-list-title {
  font-weight: 600;
  opacity: 0.85;
  line-height: 1.3;
  flex: 0 1 auto;
  width: auto;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-list :deep(.w-expand) {
  flex: 1 1 auto;
  min-width: 3.5em;
  width: 100%;
  max-width: 100%;
}
</style>
