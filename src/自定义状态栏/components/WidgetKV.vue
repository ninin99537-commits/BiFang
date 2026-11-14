<template>
  <div class="w-kv" :style="wrapStyle">
    <span v-if="widget.label" class="w-kv-key" :style="titleStyle">{{ widget.label }}</span>
    <div class="w-kv-fields" :class="[fieldsClass, 'align-' + style.align, 'valign-' + (style.alignV || 'center')]" :style="fieldsStyle">
      <template v-if="entries.length > 1">
        <div v-for="(e, i) in entries" :key="i" class="w-kv-item" :class="[fieldsClass, 'valign-' + (style.alignV || 'center')]" :style="i > 0 && fieldsNegMargin ? fieldsNegMargin : undefined">
          <span v-if="e.name" class="w-kv-sub" :title="e.name">{{ e.name }}</span>
          <ExpandableParts
            class="w-kv-expand"
            :parts="partsOf(e.value)"
            :style-obj="style"
            :layout="fieldsClass"
            :align="style.align"
            :align-v="style.alignV"
          />
        </div>
      </template>
      <ExpandableParts
        v-else
        class="w-kv-expand"
        :parts="singleParts"
        :style-obj="style"
        :layout="fieldsClass"
        :align="style.align"
        :align-v="style.alignV"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Widget } from '../schema';
import { displayParts } from '../lib/datasource';
import { useConfigStore } from '../store';
import { resolveStyle, baseWidgetCss, labelCss } from '../lib/style';
import ExpandableParts from './ExpandableParts.vue';

const props = defineProps<{ widget: Widget; value?: any }>();
const store = useConfigStore();
const style = computed(() => resolveStyle(store.config.layout, props.widget));
const entries = computed(() => {
  void store.dataTick;
  return store.widgetEntries(props.widget);
});
const singleParts = computed(() => displayParts(props.value ?? entries.value[0]?.value));
function partsOf(v: any) {
  return displayParts(v);
}
const fieldsClass = computed(() => (style.value.fieldsLayout === 'inline' ? 'inline' : 'stack'));
const fieldsGap = computed(() => (style.value.fieldsGap ?? 6));
const fieldsStyle = computed(() => fieldsGap.value >= 0 ? { gap: fieldsGap.value + 'px' } : { gap: '0px' });
const fieldsNegMargin = computed(() => {
  const g = fieldsGap.value;
  if (g >= 0) return null;
  return style.value.fieldsLayout === 'inline' ? { marginLeft: g + 'px' } : { marginTop: g + 'px' };
});
const wrapStyle = computed(() => ({
  ...baseWidgetCss(style.value),
  display: 'flex',
  gap: '6px',
}) as Record<string, string | undefined>);
const titleStyle = computed(() => labelCss(style.value));
</script>

<style scoped>
.w-kv {
  word-break: break-word;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}
.w-kv-key {
  opacity: 0.9;
  /* 可让位给数据区，避免窄列只剩标题、数值完全消失 */
  flex: 0 1 auto;
  width: auto;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.w-kv-fields {
  display: flex;
  flex: 1 1 auto;
  min-width: 3.5em;
  max-width: 100%;
  gap: 6px 10px;
  align-items: center;
  overflow: hidden;
}
.w-kv-fields.stack {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-start;
  align-self: stretch;
}
.w-kv-fields.stack.valign-center {
  justify-content: center;
}
.w-kv-fields.stack.valign-top {
  justify-content: flex-start;
}
.w-kv-fields.stack.valign-bottom {
  justify-content: flex-end;
}
.w-kv-fields.inline {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}
.w-kv-fields.align-center {
  justify-content: center;
  text-align: center;
}
.w-kv-fields.align-center.stack {
  align-items: center;
}
.w-kv-fields.align-right {
  justify-content: flex-end;
  text-align: right;
}
.w-kv-fields.align-right.stack {
  align-items: flex-end;
}
.w-kv-fields.align-left {
  justify-content: flex-start;
  text-align: left;
}
.w-kv-item {
  display: flex;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  overflow: hidden;
}
.w-kv-item :deep(.w-expand),
.w-kv-fields > :deep(.w-expand) {
  min-width: 0;
  max-width: 100%;
  width: 100%;
  flex: 1 1 auto;
}
.w-kv-item.stack {
  flex-direction: column;
  align-items: inherit;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.w-kv-item.stack.valign-center {
  justify-content: center;
}
.w-kv-item.stack.valign-top {
  justify-content: flex-start;
}
.w-kv-item.stack.valign-bottom {
  justify-content: flex-end;
}
.w-kv-item.inline {
  flex-direction: row;
  align-items: center;
  flex: 0 1 auto;
}
.w-kv-sub {
  opacity: 0.75;
  font-size: 0.9em;
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.w-kv-item.inline .w-kv-sub {
  flex: 0 1 auto;
  max-width: min(70%, 12em);
}
.w-kv-expand :deep(.w-chip) {
  font-weight: 600;
}
</style>
